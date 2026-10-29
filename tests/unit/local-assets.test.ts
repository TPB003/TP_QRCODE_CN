// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createOssBucketFromEnv, createBindings } from "../../apps/api/src/runtime";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("persistent local asset storage", () => {
  it("is the production default and preserves uploaded bytes and metadata", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "tpqr-assets-"));
    temporaryDirectories.push(directory);
    const bindings = createBindings({
      databasePath: path.join(directory, "tpqr.sqlite"),
      assetPath: path.join(directory, "assets"),
      environment: "production",
    });

    try {
      await bindings.ASSETS_BUCKET.put("users/u1/assets/a1/original", new Uint8Array([137, 80, 78, 71]), {
        httpMetadata: { contentType: "image/png", cacheControl: "private, max-age=0" },
      });
      const stored = await bindings.ASSETS_BUCKET.get("users/u1/assets/a1/original");
      expect(stored).not.toBeNull();
      if (!stored) throw new Error("uploaded asset was not stored");
      const headers = new Headers();
      stored.writeHttpMetadata(headers);
      expect(headers.get("content-type")).toBe("image/png");
      expect(headers.get("cache-control")).toBe("private, max-age=0");
      expect(Array.from(new Uint8Array(await new Response(stored.body).arrayBuffer()))).toEqual([137, 80, 78, 71]);

      await bindings.ASSETS_BUCKET.delete("users/u1/assets/a1/original");
      expect(await bindings.ASSETS_BUCKET.get("users/u1/assets/a1/original")).toBeNull();
      await expect(bindings.ASSETS_BUCKET.get("../../outside")).rejects.toThrow("invalid object key");
    } finally {
      bindings.DB.close?.();
    }
  });

  it("uses local storage when OSS is unset and rejects partial OSS configuration", async () => {
    await expect(createOssBucketFromEnv({})).resolves.toBeUndefined();
    await expect(createOssBucketFromEnv({ OSS_REGION: "cn-hangzhou" })).rejects.toThrow("OSS configuration is incomplete");
  });
});
