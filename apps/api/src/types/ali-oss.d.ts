declare module "ali-oss" {
  interface ClientOptions { [key: string]: unknown }
  interface Client {
    put(key: string, value: Uint8Array, options?: Record<string, unknown>): Promise<unknown>;
    get(key: string): Promise<{ content: Uint8Array; res?: { headers?: Record<string, string> } }>;
    delete(key: string): Promise<unknown>;
  }
  const OSS: { new (options: ClientOptions): Client };
  export default OSS;
}
