/**
 * W036-W3 — app.asar 无依赖扫描器。
 *
 * 不依赖 @electron/asar（审计必须能在未安装 devDependencies 的机器上运行）。
 * 直接按 asar 归档头布局解析（与 @electron/asar 的 disk.ts/filesystem.ts 同构）：
 *   字节 0-3  : size-pickle 的 payload 长度（恒为 4，即 04 00 00 00）；
 *   字节 4-7  : uint32 LE = headerSize（第二个 pickle 的总大小，含其 4 字节长度前缀）；
 *   字节 8..  : header pickle = [uint32 payloadSize][payload: [uint32 字符串长度][JSON][对齐填充]]，
 *               即 JSON 字符串位于 headerBuf 偏移 8，长度为 headerBuf 偏移 4 的 uint32；
 *   数据段    : 8 + headerSize 起（headerSize 即字节 4-7 的值）；索引中的 offset 相对数据段起点。
 * 解析后按文件区间（pread）读取目标范围，实现精确的 per-file 扫描归属。
 *
 * 若归档头无法按该布局解析（例如未来格式变化），返回 parseError——调用方按
 * 「无法验证」处理（品牌审计不允许静默跳过身份检查）。
 */
import { openSync, closeSync, readSync, statSync } from "node:fs";
import { extname } from "node:path";
import { classifyTextContent, OWN_CODE_SCOPES, SCANNABLE_EXTENSIONS } from "./brand-rules.mjs";

const MAX_SCAN_FILE_BYTES = 32 * 1024 * 1024; // 单文件扫描上限（防御异常超大条目）

/**
 * 解析 asar 头。返回 { index, dataStart, fileCount } 或 { parseError }。
 * index 形如 { files: { out: { files: {...} }, package.json: { offset, size } } }。
 */
export function parseAsarHeader(archivePath) {
  let fd;
  try {
    fd = openSync(archivePath, "r");
    const sizeBuf = Buffer.alloc(8);
    const read = readSync(fd, sizeBuf, 0, 8, 0);
    if (read !== 8) {
      return { parseError: `asar 头前 8 字节读取不足（${read}）` };
    }
    const sizePicklePayload = sizeBuf.readUInt32LE(0); // 恒为 4（size-pickle 只装一个 uint32）
    const headerSize = sizeBuf.readUInt32LE(4); // 第二个 pickle 的总大小
    if (sizePicklePayload !== 4 || headerSize <= 8 || headerSize > 512 * 1024 * 1024) {
      return {
        parseError: `asar 头尺寸异常: sizePicklePayload=${sizePicklePayload} headerSize=${headerSize}`,
      };
    }
    const jsonSize = headerSize;
    const headerBuf = Buffer.alloc(jsonSize);
    const headerRead = readSync(fd, headerBuf, 0, jsonSize, 8);
    if (headerRead !== jsonSize) {
      return { parseError: `asar JSON header 读取不足（${headerRead}/${jsonSize}）` };
    }
    // pickle payload: [uint32 字符串长度][JSON 字符串]；字符串起点在 payload +4。
    const strLength = headerBuf.readUInt32LE(4);
    if (strLength <= 0 || strLength > jsonSize) {
      return { parseError: `asar header 字符串长度异常: ${strLength}（jsonSize=${jsonSize}）` };
    }
    const jsonText = headerBuf.subarray(8, 8 + strLength).toString("utf8");
    let index;
    try {
      index = JSON.parse(jsonText);
    } catch (error) {
      return { parseError: `asar header JSON 解析失败: ${error.message}` };
    }
    if (!index || typeof index !== "object" || !index.files) {
      return { parseError: "asar header JSON 缺少 files 索引" };
    }
    // 数据段起点：8 字节前缀 + headerSize（与 @electron/asar 的 8 + headerSize + offset 公式一致）。
    return { index, dataStart: 8 + jsonSize, fileCount: countFiles(index) };
  } catch (error) {
    return { parseError: `asar 打开/读取失败: ${error.message}` };
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // 关闭失败不影响结果
      }
    }
  }
}

function countFiles(node) {
  let total = 0;
  for (const entry of Object.values(node.files ?? {})) {
    if (entry.files) total += countFiles(entry);
    else total += 1;
  }
  return total;
}

/** 展平 asar 索引为文件列表 [{ path, offset, size, unpacked }]（unpacked 条目无数据偏移）。 */
export function listAsarFiles(index) {
  const out = [];
  function walk(node, prefix) {
    for (const [name, entry] of Object.entries(node.files ?? {})) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.files) {
        walk(entry, path);
      } else {
        out.push({
          path,
          offset: typeof entry.offset === "string" ? Number(entry.offset) : null,
          size: typeof entry.size === "number" ? entry.size : 0,
          unpacked: entry.unpacked === true,
        });
      }
    }
  }
  walk(index, "");
  return out;
}

/** 按区间读取单个 asar 文件内容（返回 Buffer；越界/无偏移返回 null）。 */
function readAsarFileRange(fd, dataStart, file, totalSize) {
  if (file.unpacked || file.offset === null || file.size <= 0) return null;
  if (file.size > MAX_SCAN_FILE_BYTES) return null;
  const start = dataStart + file.offset;
  if (start + file.size > totalSize) return null;
  const buffer = Buffer.alloc(file.size);
  const read = readSync(fd, buffer, 0, file.size, start);
  if (read !== file.size) return null;
  return buffer;
}

/**
 * 扫描 asar 内的「自有代码」范围（out/** 与根 package.json）。
 * 返回：
 * {
 *   mode: "asar-header-ranges",
 *   scannedFiles: n, skippedBinary: n, skippedOversize: n, outOfScope: n,
 *   violations: [{ file, patternId, reason, snippet }],
 *   exceptionCounts: { id: count },
 *   reviewItems: [{ file, snippet }],
 *   rootPackage: { name, productName, version, description } | null,
 *   rendererTitle: string | null,
 *   parseError?: string,
 * }
 */
export function scanAsarOwnCode(archivePath) {
  const result = {
    mode: "asar-header-ranges",
    scannedFiles: 0,
    skippedBinary: 0,
    skippedOversize: 0,
    outOfScope: 0,
    violations: [],
    exceptionCounts: {},
    reviewItems: [],
    rootPackage: null,
    rendererTitle: null,
  };

  const header = parseAsarHeader(archivePath);
  if (header.parseError) {
    result.parseError = header.parseError;
    return result;
  }
  const totalSize = statSync(archivePath).size;
  const files = listAsarFiles(header.index);
  const fd = openSync(archivePath, "r");
  try {
    for (const file of files) {
      const inOwnScope =
        file.path === "package.json" || OWN_CODE_SCOPES.some((scope) => file.path.startsWith(scope));
      if (!inOwnScope) {
        result.outOfScope += 1;
        continue;
      }
      const buffer = readAsarFileRange(fd, header.dataStart, file, totalSize);
      if (buffer === null) {
        if (file.size > MAX_SCAN_FILE_BYTES) result.skippedOversize += 1;
        else if (!file.unpacked && file.offset !== null) result.skippedBinary += 1;
        continue;
      }
      const ext = extname(file.path).toLowerCase();
      if (!SCANNABLE_EXTENSIONS.has(ext)) {
        result.skippedBinary += 1;
        continue;
      }
      const text = buffer.toString("utf8");
      result.scannedFiles += 1;

      // 根 package.json：Electron app.getName() 的来源（productName 优先）。
      if (file.path === "package.json") {
        try {
          const pkg = JSON.parse(text);
          result.rootPackage = {
            name: typeof pkg.name === "string" ? pkg.name : null,
            productName: typeof pkg.productName === "string" ? pkg.productName : null,
            version: typeof pkg.version === "string" ? pkg.version : null,
            description: typeof pkg.description === "string" ? pkg.description : null,
          };
        } catch {
          // JSON 损坏留给 identity 检查报错
        }
      }
      // renderer 入口 HTML：窗口标题来源（document.title → BrowserWindow 标题）。
      if (file.path === "out/renderer/index.html") {
        const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i);
        result.rendererTitle = titleMatch ? titleMatch[1].trim() : null;
      }

      const classification = classifyTextContent(text);
      if (classification.violations.length > 0) {
        for (const violation of classification.violations) {
          result.violations.push({ file: file.path, ...violation });
        }
      }
      for (const [id, count] of Object.entries(classification.exceptionCounts)) {
        result.exceptionCounts[id] = (result.exceptionCounts[id] ?? 0) + count;
      }
      for (const item of classification.reviewItems) {
        result.reviewItems.push({ file: file.path, ...item });
      }
    }
  } finally {
    closeSync(fd);
  }
  return result;
}
