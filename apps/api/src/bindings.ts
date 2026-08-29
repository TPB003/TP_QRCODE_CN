/** Runtime contracts shared by the Node/Hono API and route modules. */
export interface SqlResult {
  success: boolean;
  meta: { changes: number; last_row_id?: number | bigint; rows_read?: number; rows_written?: number };
}
export interface SqlStatement {
  bind(...values: unknown[]): SqlBoundStatement;
  run(): Promise<SqlResult>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean; meta: SqlResult["meta"] }>;
}
export interface SqlBoundStatement {
  run(): Promise<SqlResult>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean; meta: SqlResult["meta"] }>;
}
export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  batch(statements: SqlBoundStatement[]): Promise<SqlResult[]>;
  exec(sql: string): Promise<void>;
  close?(): void;
}
export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}
export interface ObjectPutOptions {
  httpMetadata?: { contentType?: string; contentDisposition?: string; cacheControl?: string };
}
export interface AssetBucket {
  put(key: string, value: ArrayBuffer | Uint8Array | string, options?: ObjectPutOptions): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}
export interface Bindings {
  DB: SqlDatabase;
  ASSETS_BUCKET: AssetBucket;
  ENVIRONMENT: "development" | "staging" | "production" | "test";
  APP_ORIGIN: string;
  PUBLIC_QR_ORIGIN?: string;
  AUTH_DELIVERY_MODE?: "dev" | "resend";
  AUTH_TEST_CODE?: string;
  AUTH_ALLOWED_EMAILS?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  AUTH_GOOGLE_CLIENT_ID?: string;
  AUTH_GOOGLE_CLIENT_SECRET?: string;
  AUTH_GITHUB_CLIENT_ID?: string;
  AUTH_GITHUB_CLIENT_SECRET?: string;
  AUTH_OAUTH_CALLBACK_ORIGIN?: string;
  SESSION_COOKIE_SECRET?: string;
}
