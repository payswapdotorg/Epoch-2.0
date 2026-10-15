/**
 * W037-W2 — 本地静态更新 feed 服务器 + latest-linux.yml 夹具构造。
 *
 * 用途（dev-update-journey）：
 * - 在 dev-app-update.yml 指向的地址（默认 http://localhost:8081）提供：
 *   latest-linux.yml（版本高于当前 app 的 crafted manifest）+ 与 manifest 完全一致的
 *   小型 dummy 更新文件（sha512 以 base64 记录 —— electron-updater 下载后会校验）。
 * - 记录每一次命中（机器可读 hit 列表：方法/URL/字节数/状态）。
 *
 * manifest 形态对齐 electron-builder 的 generic feed 产物（latest-linux.yml）：
 *   version / path / sha512 / files[{url, sha512, size}] / releaseName / releaseNotes /
 *   releaseDate。差分包（*.blockmap）刻意不提供 —— electron-updater 检测不到 blockmap
 *   会回退全量下载，本旅程就是要走全量下载→校验→staged 的真实链路。
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DUMMY_UPDATE_BYTES = 3 * 1024 * 1024; // 3MB：足够触发多次 download-progress 事件

export function bumpPatchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(String(version ?? "").trim());
  if (!match) {
    throw new Error(`无法解析版本号进行 patch bump: ${version}`);
  }
  const patch = Number.parseInt(match[3], 10) + 1;
  return `${match[1]}.${match[2]}.${patch}`;
}

/**
 * 构造更新夹具目录。
 * @returns {{fixtureDir:string, fileName:string, targetVersion:string, manifestPath:string,
 *   manifestText:string, sha512Base64:string, bytes:number, releaseNotes:string}}
 */
export function craftUpdateFixture({ currentVersion, outDir, platformTag = "linux-x86_64" }) {
  const targetVersion = bumpPatchVersion(currentVersion);
  const fileName = `Epoch-${targetVersion}-${platformTag}.AppImage`;
  mkdirSync(outDir, { recursive: true });
  const filePath = join(outDir, fileName);
  // 确定性内容：版本字符串重复填充（dummy 文件不追求真实安装语义 —— 旅程终点是 staged）。
  const block = Buffer.from(
    `${targetVersion} w037 hermetic dev update journey fixture\n`,
    "utf8",
  );
  const buffer = Buffer.alloc(DUMMY_UPDATE_BYTES);
  for (let offset = 0; offset < buffer.length; offset += block.length) {
    block.copy(buffer, offset);
  }
  writeFileSync(filePath, buffer);
  const sha512Base64 = createHash("sha512").update(buffer).digest("base64");
  const releaseNotes = [
    `# Epoch ${targetVersion}（W037 验收夹具）`,
    "",
    "- 此版本由 update-channel 验收旅程的本地 feed 服务器提供（dev-app-update.yml → localhost）。",
    "- 用于驱动 check → available → downloading → ready(staged) 的真实 electron-updater 链路。",
    "- staging 即验收终点：quitAndInstall 会重启应用，不在验收旅程内执行。",
  ].join("\n");
  const manifestText = [
    `version: ${targetVersion}`,
    `releaseName: 'Epoch ${targetVersion} (w037 acceptance fixture)'`,
    "releaseNotes: >-",
    `  ${releaseNotes.replace(/\n/g, " ").replace(/  +/g, " ")}`,
    `releaseDate: '${new Date().toISOString()}'`,
    `path: ${fileName}`,
    `sha512: ${sha512Base64}`,
    "files:",
    `  - url: ${fileName}`,
    `    sha512: ${sha512Base64}`,
    `    size: ${buffer.length}`,
    "",
  ].join("\n");
  const manifestPath = join(outDir, "latest-linux.yml");
  writeFileSync(manifestPath, manifestText, "utf8");
  return {
    fixtureDir: outDir,
    fileName,
    targetVersion,
    manifestPath,
    manifestText,
    sha512Base64,
    bytes: buffer.length,
    releaseNotes,
  };
}

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".htm", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".yml", "text/yaml; charset=utf-8"],
  [".yaml", "text/yaml; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".wasm", "application/wasm"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".map", "application/json; charset=utf-8"],
]);

function contentTypeFor(fileName) {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return MIME_TYPES.get(fileName.slice(dot).toLowerCase()) ?? "application/octet-stream";
}

/**
 * 启动静态文件服务器（serveDir 下的一切文件；按扩展名返回正确 content-type ——
 * index.html 必须是 text/html，否则主框架导航会被当作下载而 ERR_FAILED）。
 * defaultFile：目录根路径（"/"）命中的文件 —— feed 服务器用 latest-linux.yml；
 * dev renderer 服务器用 index.html（ELECTRON_RENDERER_URL 契约）。
 * @returns {Promise<{port:number, origin:string, hits:()=>Array, close:()=>Promise<void>}>}
 */
export async function startFeedServer({ serveDir, port = 8081, host = "127.0.0.1", defaultFile = "latest-linux.yml" }) {
  if (!existsSync(serveDir)) {
    throw new Error(`feed 服务器目录不存在: ${serveDir}`);
  }
  const hits = [];
  const server = createServer((req, res) => {
    const urlPath = (req.url ?? "/").split("?")[0].replace(/^\/+/, "") || defaultFile;
    const safePath = urlPath.includes("..") ? defaultFile : urlPath;
    const filePath = join(serveDir, safePath);
    const hit = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      host: req.headers.host ?? null,
      userAgent: req.headers["user-agent"] ?? null,
      file: safePath,
    };
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      hit.status = 404;
      hits.push(hit);
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    const size = statSync(filePath).size;
    hit.status = 200;
    hit.bytes = size;
    hits.push(hit);
    const contentType = contentTypeFor(safePath);
    res.writeHead(200, {
      "content-type": contentType,
      "content-length": String(size),
      "accept-ranges": "bytes",
    });
    createReadStream(filePath).pipe(res);
    res.on("close", () => {
      hit.completedAt = new Date().toISOString();
    });
  });
  await new Promise((resolveListen) => {
    server.listen(port, host, resolveListen);
  });
  const bound = server.address();
  const close = async () => {
    await new Promise((resolveClose) => {
      server.close(() => resolveClose());
      server.closeAllConnections?.();
      setTimeout(resolveClose, 500).unref?.();
    });
  };
  return {
    port: typeof bound === "object" && bound ? bound.port : port,
    origin: `http://${host}:${typeof bound === "object" && bound ? bound.port : port}`,
    hits: () => hits,
    close,
  };
}

/** 读取 dev feed 配置（packages/desktop/dev-app-update.yml —— 只读消费）。 */
export function readDevAppUpdateYaml(desktopRoot) {
  const path = join(desktopRoot, "dev-app-update.yml");
  const text = readFileSync(path, "utf8");
  const parsed = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) parsed[match[1]] = match[2].trim();
  }
  return { path, text, parsed };
}
