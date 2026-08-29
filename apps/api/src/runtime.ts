import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import type {
  AssetBucket,
  Bindings,
  ObjectPutOptions,
  SqlBoundStatement,
  SqlDatabase,
  SqlResult,
  SqlStatement,
  StoredObject,
} from "./bindings";

type BetterDatabase = Database.Database;
type BetterStatement = Database.Statement<unknown[], unknown>;

type BinaryPayload = Uint8Array | ArrayBuffer | string;
interface OssResponse {
  content: BinaryPayload;
  res?: { headers?: Record<string, string> };
}
interface OssClient {
  put(key: string, value: Uint8Array, options?: { headers?: Record<string, string> }): Promise<unknown>;
  get(key: string): Promise<OssResponse>;
  delete(key: string): Promise<unknown>;
}

class SqliteBoundStatement implements SqlBoundStatement {
  constructor(private readonly statement: BetterStatement, private readonly values: unknown[]) {}

  runSync(): SqlResult {
    const result = this.statement.run(...this.values.map(normalizeSqlValue));
    return {
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: typeof result.lastInsertRowid === "bigint" ? result.lastInsertRowid : Number(result.lastInsertRowid),
      },
    };
  }

  run(): Promise<SqlResult> { return Promise.resolve(this.runSync()); }

  first<T>(): Promise<T | null> {
    const value = this.statement.get(...this.values.map(normalizeSqlValue)) as T | undefined;
    return Promise.resolve(value ?? null);
  }

  all<T>(): Promise<{ results: T[]; success: boolean; meta: SqlResult["meta"] }> {
    const results = this.statement.all(...this.values.map(normalizeSqlValue)) as T[];
    return Promise.resolve({ results, success: true, meta: { changes: 0, rows_read: results.length } });
  }
}

class SqliteStatement implements SqlStatement {
  constructor(private readonly statement: BetterStatement) {}

  bind(...values: unknown[]): SqlBoundStatement { return new SqliteBoundStatement(this.statement, values); }

  run(): Promise<SqlResult> { return new SqliteBoundStatement(this.statement, []).run(); }
  first<T>(): Promise<T | null> { return new SqliteBoundStatement(this.statement, []).first<T>(); }
  all<T>(): Promise<{ results: T[]; success: boolean; meta: SqlResult["meta"] }> { return new SqliteBoundStatement(this.statement, []).all<T>(); }
}

class SqliteDatabase implements SqlDatabase {
  constructor(readonly handle: BetterDatabase) {}

  prepare(sql: string): SqlStatement { return new SqliteStatement(this.handle.prepare(sql)); }

  batch(statements: SqlBoundStatement[]): Promise<SqlResult[]> {
    const transaction = this.handle.transaction(() => {
      const results: SqlResult[] = [];
      for (const statement of statements) {
        if (!(statement instanceof SqliteBoundStatement)) throw new Error("batch statements must belong to this database");
        results.push(statement.runSync());
      }
      return results;
    });
    const results = transaction();
    return Promise.resolve(results);
  }

  exec(sql: string): Promise<void> {
    this.handle.exec(sql);
    return Promise.resolve();
  }

  close(): void { this.handle.close(); }
}

function normalizeSqlValue(value: unknown): unknown {
  return value === undefined ? null : value;
}

class LocalAssetBucket implements AssetBucket {
  constructor(private readonly root: string) {}

  private filePath(key: string): string {
    if (!key || key.includes("\\") || key.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("invalid object key");
    const resolved = path.resolve(this.root, ...key.split("/"));
    const root = path.resolve(this.root) + path.sep;
    if (!resolved.startsWith(root)) throw new Error("invalid object key");
    return resolved;
  }

  private metadataPath(filePath: string): string { return `${filePath}.meta.json`; }

  async put(key: string, value: ArrayBuffer | Uint8Array | string, options?: ObjectPutOptions): Promise<void> {
    const filePath = this.filePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    const bytes = typeof value === "string" ? Buffer.from(value) : Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value);
    await writeFile(filePath, bytes);
    await writeFile(this.metadataPath(filePath), JSON.stringify(options?.httpMetadata ?? {}), "utf8");
  }

  async get(key: string): Promise<StoredObject | null> {
    const filePath = this.filePath(key);
    let bytes: Buffer;
    try { bytes = await readFile(filePath); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    let metadata: ObjectPutOptions["httpMetadata"] = {};
    try { metadata = JSON.parse(await readFile(this.metadataPath(filePath), "utf8")) as ObjectPutOptions["httpMetadata"]; } catch { /* metadata is optional */ }
    const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
    return {
      body: new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer]).stream(),
      httpEtag: etag,
      writeHttpMetadata(headers) {
        if (metadata?.contentType) headers.set("Content-Type", metadata.contentType);
        if (metadata?.contentDisposition) headers.set("Content-Disposition", metadata.contentDisposition);
        if (metadata?.cacheControl) headers.set("Cache-Control", metadata.cacheControl);
      },
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = this.filePath(key);
    await Promise.all([unlink(filePath).catch(() => undefined), unlink(this.metadataPath(filePath)).catch(() => undefined)]);
  }
}

/** Minimal OSS adapter. Credentials are read only from the process environment. */
class OssAssetBucket implements AssetBucket {
  constructor(private readonly client: OssClient) {}

  async put(key: string, value: ArrayBuffer | Uint8Array | string, options?: ObjectPutOptions): Promise<void> {
    const headers: Record<string, string> = {};
    if (options?.httpMetadata?.contentType) headers["Content-Type"] = options.httpMetadata.contentType;
    if (options?.httpMetadata?.contentDisposition) headers["Content-Disposition"] = options.httpMetadata.contentDisposition;
    await this.client.put(key, toBuffer(value), { headers });
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const response = await this.client.get(key);
      const content = toBuffer(response.content);
      const headers = response.res?.headers ?? {};
      return {
        body: new Blob([content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer]).stream(),
        httpEtag: String(headers.etag ?? `"${createHash("sha256").update(content).digest("hex")}"`),
        writeHttpMetadata(target) {
          if (headers["content-type"]) target.set("Content-Type", String(headers["content-type"]));
          if (headers["content-disposition"]) target.set("Content-Disposition", String(headers["content-disposition"]));
        },
      };
    } catch (error) {
      if ((error as { code?: string }).code === "NoSuchKey" || (error as { status?: number }).status === 404) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> { await this.client.delete(key); }
}

export interface RuntimeOptions {
  databasePath: string;
  assetPath?: string;
  environment?: Bindings["ENVIRONMENT"];
  appOrigin?: string;
  assetBucket?: AssetBucket;
  variables?: Partial<Bindings>;
}

export function openDatabase(databasePath: string): SqliteDatabase {
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  return new SqliteDatabase(database);
}

export function createBindings(options: RuntimeOptions): Bindings {
  const database = openDatabase(options.databasePath);
  const variables = options.variables ?? {};
  return {
    DB: database,
    ASSETS_BUCKET: options.assetBucket ?? new LocalAssetBucket(options.assetPath ?? path.resolve(path.dirname(options.databasePath), "assets")),
    ENVIRONMENT: options.environment ?? "development",
    APP_ORIGIN: options.appOrigin ?? "http://127.0.0.1:5173",
    PUBLIC_QR_ORIGIN: options.appOrigin ?? "http://127.0.0.1:5173",
    AUTH_DELIVERY_MODE: "dev",
    AUTH_TEST_CODE: "123456",
    AUTH_ALLOWED_EMAILS: "*",
    ...variables,
  };
}

export async function createOssBucketFromEnv(): Promise<AssetBucket | undefined> {
  const { OSS_REGION, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET, OSS_ENDPOINT } = process.env;
  if (!OSS_REGION || !OSS_ACCESS_KEY_ID || !OSS_ACCESS_KEY_SECRET || !OSS_BUCKET) return undefined;
  const module = await import("ali-oss");
  const client = new module.default({ region: OSS_REGION, accessKeyId: OSS_ACCESS_KEY_ID, accessKeySecret: OSS_ACCESS_KEY_SECRET, bucket: OSS_BUCKET, endpoint: OSS_ENDPOINT, secure: true });
  return new OssAssetBucket(client);
}

function toBuffer(value: BinaryPayload): Buffer {
  if (typeof value === "string") return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
  return Buffer.from(value);
}

export type { SqliteDatabase, LocalAssetBucket };
