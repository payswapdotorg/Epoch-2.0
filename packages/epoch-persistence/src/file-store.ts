/**
 * epoch-persistence 文件适配器：确定性内容寻址 WorldStore。
 *
 * 依据 ARCHITECTURE-LOCK #17（确定性）与 W021 任务包第 2 条：
 * - 路径由摘要内容寻址派生：revisions/<d[0:2]>/<digest>.json（同修订 → 同路径
 *   → 同字节；分片目录避免单目录膨胀）；
 * - 原子写：先写同目录临时文件（随机后缀——临时名不属于载荷）再 rename，
 *   读端永远不会观察到半写状态；
 * - 载荷无时间戳：文件字节 = canonicalJsonStringify(记录)，同记录恒同字节；
 * - 解/surface 记录按身份键哈希寻址（sha256(identityKey)/sha256(tabId)），
 *   upsert 语义（世系增长/锚点前移由注册表驱动，适配器只原样存取）；
 * - 冲突定律：内容寻址键上已存在不同字节 → record-conflict（绝不静默覆盖）。
 */
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";
import type {
  PersistedRevision,
  PersistedSolution,
  SessionSurfaceIdentity,
  SolutionIdentity,
  WorldStore,
} from "./contract.ts";
import { canonicalJsonStringify } from "./canonical.ts";
import { PersistenceError } from "./errors.ts";
import { solutionIdentityKey } from "./identity.ts";
import {
  assertDigestKey,
  assertIdentityKey,
  assertPersistableRevision,
  assertPersistableSolution,
  assertPersistableSurfaceIdentity,
  parseStoredRevision,
  parseStoredSolution,
  parseStoredSurfaceIdentity,
} from "./validation.ts";

/** 文件适配器默认 storeKind。 */
export const FILE_STORE_KIND = "file" as const;

/** 文件适配器选项。 */
export interface FileSystemWorldStoreOptions {
  /** 存储根目录（调用方负责生命周期；目录按需递归创建）。 */
  readonly rootDir: string;
  /** storeKind 标识（缺省 "file"；外部部署可用自己的部署 id 区分）。 */
  readonly storeKind?: string;
}

/**
 * 确定性文件 WorldStore：内容寻址路径 + 原子写 + 无时间戳载荷。
 * 一个实例对应一个 rootDir；无内部可变全局状态（进程内可多实例并行）。
 */
export class FileSystemWorldStore implements WorldStore {
  readonly storeKind: string;
  private readonly rootDir: string;

  constructor(options: FileSystemWorldStoreOptions) {
    this.rootDir = options.rootDir;
    this.storeKind = options.storeKind ?? FILE_STORE_KIND;
  }

  async saveRevision(record: PersistedRevision): Promise<void> {
    assertPersistableRevision(record, this.storeKind);
    const target = this.revisionPath(record.digest);
    const bytes = canonicalJsonStringify(record);
    await this.writeAtomicIfAbsent(target, bytes, record.digest);
  }

  async loadRevision(digest: string): Promise<PersistedRevision> {
    assertDigestKey(digest, this.storeKind);
    const target = this.revisionPath(digest);
    const text = await this.readRecord(target, digest);
    return parseStoredRevision(text, this.storeKind, digest);
  }

  async listRevisions(): Promise<readonly PersistedRevision[]> {
    const records = await this.readAll(path.join(this.rootDir, "revisions"), (text, key) =>
      parseStoredRevision(text, this.storeKind, key),
    );
    return records.sort((left, right) => compareBy(left, right, (record) => record.digest));
  }

  async saveSolution(solution: PersistedSolution): Promise<void> {
    assertPersistableSolution(solution, this.storeKind);
    await this.writeAtomic(this.solutionPath(solution.identity), canonicalJsonStringify(solution));
  }

  async loadSolution(identity: SolutionIdentity): Promise<PersistedSolution> {
    assertIdentityKey(identity, this.storeKind);
    const key = solutionIdentityKey(identity);
    const text = await this.readRecord(this.solutionPath(identity), key);
    const parsed = parseStoredSolution(text, this.storeKind, key);
    // 键-内容一致性校验：内容寻址键与载荷身份不符按损坏浮出（不修复）。
    if (parsed.identity.workspaceKey !== identity.workspaceKey) {
      throw this.identityMismatch(key);
    }
    if (parsed.identity.engineId !== identity.engineId) {
      throw this.identityMismatch(key);
    }
    if (parsed.identity.solutionId !== identity.solutionId) {
      throw this.identityMismatch(key);
    }
    return parsed;
  }

  async listSolutions(): Promise<readonly PersistedSolution[]> {
    const records = await this.readAll(path.join(this.rootDir, "solutions"), (text, key) =>
      parseStoredSolution(text, this.storeKind, key),
    );
    return records.sort((left, right) =>
      compareBy(left, right, (solution) => solutionIdentityKey(solution.identity)),
    );
  }

  async saveSurfaceIdentity(identity: SessionSurfaceIdentity): Promise<void> {
    assertPersistableSurfaceIdentity(identity, this.storeKind);
    await this.writeAtomic(this.surfacePath(identity.tabId), canonicalJsonStringify(identity));
  }

  async loadSurfaceIdentity(tabId: string): Promise<SessionSurfaceIdentity> {
    const text = await this.readRecord(this.surfacePath(tabId), tabId);
    const parsed = parseStoredSurfaceIdentity(text, this.storeKind, tabId);
    if (parsed.tabId !== tabId) {
      throw new PersistenceError({
        code: "record-malformed",
        storeKind: this.storeKind,
        key: tabId,
        message: `stored surface identity key mismatch: expected tabId ${tabId}, found ${parsed.tabId}`,
      });
    }
    return parsed;
  }

  async listSurfaceIdentities(): Promise<readonly SessionSurfaceIdentity[]> {
    const records = await this.readAll(path.join(this.rootDir, "surfaces"), (text, key) =>
      parseStoredSurfaceIdentity(text, this.storeKind, key),
    );
    return records.sort((left, right) => compareBy(left, right, (identity) => identity.tabId));
  }

  /** 修订文件路径：<root>/revisions/<digest[0:2]>/<digest>.json。 */
  private revisionPath(digest: string): string {
    return path.join(this.rootDir, "revisions", digest.slice(0, 2), `${digest}.json`);
  }

  /** 解记录路径：sha256(身份键) 文件名——身份明文在载荷内。 */
  private solutionPath(identity: SolutionIdentity): string {
    return path.join(this.rootDir, "solutions", `${sha256Hex(solutionIdentityKey(identity))}.json`);
  }

  /** surface 身份记录路径：sha256(tabId) 文件名。 */
  private surfacePath(tabId: string): string {
    return path.join(this.rootDir, "surfaces", `${sha256Hex(tabId)}.json`);
  }

  private identityMismatch(key: string): PersistenceError {
    return new PersistenceError({
      code: "record-malformed",
      storeKind: this.storeKind,
      key,
      message: `stored solution record at ${key} carries a different identity than requested`,
    });
  }

  /**
   * 内容寻址写入：目标已存在且字节一致 → 幂等 no-op；字节不一致 →
   * record-conflict（内容寻址冲突，绝不静默覆盖）。
   */
  private async writeAtomicIfAbsent(target: string, bytes: string, digest: string): Promise<void> {
    const existing = await this.readFileOrNull(target);
    if (existing !== null) {
      if (existing === bytes) return;
      throw new PersistenceError({
        code: "record-conflict",
        storeKind: this.storeKind,
        key: digest,
        message: `content-addressed record ${digest} already exists with different bytes`,
      });
    }
    await this.writeAtomic(target, bytes);
  }

  /** 原子写：同目录临时文件 + rename（读端永不观察半写状态）。 */
  private async writeAtomic(target: string, bytes: string): Promise<void> {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.tmp-${randomUUID()}`;
    try {
      await fs.writeFile(temp, bytes, "utf8");
      await fs.rename(temp, target);
    } catch (error) {
      // 最佳努力清理残留临时文件（崩溃残留不影响读取——读取只认正式名）。
      await fs.rm(temp, { force: true }).catch(() => {});
      throw error;
    }
  }

  private async readFileOrNull(target: string): Promise<string | null> {
    try {
      return await fs.readFile(target, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private async readRecord(target: string, key: string): Promise<string> {
    const text = await this.readFileOrNull(target);
    if (text === null) {
      throw new PersistenceError({
        code: "record-not-found",
        storeKind: this.storeKind,
        key,
        message: `no persisted record for key ${key}`,
      });
    }
    return text;
  }

  /** 枚举一个记录族目录下的全部记录（递归分片子目录；目录缺失 → 空列表）。 */
  private async readAll<T>(dir: string, parse: (text: string, key: string) => T): Promise<T[]> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const records: T[] = [];
    for (const entry of entries) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 修订族使用 <digest[0:2]> 分片子目录——递归枚举。
        records.push(...(await this.readAll(target, parse)));
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        records.push(parse(await fs.readFile(target, "utf8"), entry.name));
      }
    }
    return records;
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function compareBy<T>(left: T, right: T, key: (value: T) => string): number {
  if (key(left) < key(right)) return -1;
  if (key(left) > key(right)) return 1;
  return 0;
}
