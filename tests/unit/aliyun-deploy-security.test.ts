import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

const rootHelper = "infra/aliyun/tpqr-deploy-root";
const sshHelper = "infra/aliyun/tpqr-deploy-ssh";
const supportsShellBehavior = process.platform !== "win32" && existsSync("/bin/bash");
const shellIt = supportsShellBehavior ? it : it.skip;
const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createTempDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

const releaseSha = "a".repeat(40);

function createImageArchive(directory: string, extraTag = false, badRevisionLabel = false): Buffer {
  const source = join(directory, "docker-save");
  mkdirSync(join(source, "api"), { recursive: true });
  mkdirSync(join(source, "gateway"), { recursive: true });
  writeFileSync(
    join(source, "api.json"),
    JSON.stringify({ config: { Labels: { "org.opencontainers.image.revision": badRevisionLabel ? "b".repeat(40) : releaseSha } } }),
  );
  writeFileSync(join(source, "api", "layer.tar"), "api layer");
  writeFileSync(
    join(source, "gateway.json"),
    JSON.stringify({ config: { Labels: { "org.opencontainers.image.revision": releaseSha } } }),
  );
  writeFileSync(join(source, "gateway", "layer.tar"), "gateway layer");
  writeFileSync(
    join(source, "manifest.json"),
    JSON.stringify([
      {
        Config: "api.json",
        RepoTags: extraTag
          ? [`tpqr-cn-api:${releaseSha}`, "other-image:latest"]
          : [`tpqr-cn-api:${releaseSha}`],
        Layers: ["api/layer.tar"],
      },
      {
        Config: "gateway.json",
        RepoTags: [`tpqr-cn-gateway:${releaseSha}`],
        Layers: ["gateway/layer.tar"],
      },
    ]),
  );
  const dockerTar = join(directory, "docker-save.tar");
  execFileSync("tar", [
    "-cf",
    dockerTar,
    "-C",
    source,
    "manifest.json",
    "api.json",
    "api/layer.tar",
    "gateway.json",
    "gateway/layer.tar",
  ]);
  return gzipSync(readFileSync(dockerTar));
}

function createBundle(directory: string, names: string[] = ["images.tar.gz"], extraTag = false, badRevisionLabel = false): string {
  const source = join(directory, "source");
  mkdirSync(source, { recursive: true });
  for (const name of names) {
    const contents = name === "images.tar.gz"
      ? createImageArchive(directory, extraTag, badRevisionLabel)
      : Buffer.from("extra bundle member");
    writeFileSync(join(source, name), contents);
  }
  const archive = join(directory, "release.tar");
  execFileSync("tar", ["-cf", archive, "-C", source, ...names]);
  return archive;
}

function validateBundle(archive: string) {
  return spawnSync("bash", [rootHelper, "--validate-bundle", releaseSha, archive], { encoding: "utf8" });
}

describe("Aliyun deployment input validation", () => {
  shellIt("accepts a regular bundle containing only a valid image archive", () => {
    const directory = createTempDirectory("tpqr-deploy-test-");
    const archive = createBundle(directory);
    const result = validateBundle(archive);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("bundle accepted");
  });

  shellIt("rejects extra bundle members and path traversal entries", () => {
    const directory = createTempDirectory("tpqr-deploy-test-");
    const extraArchive = createBundle(directory, ["images.tar.gz", "extra.txt"]);
    expect(validateBundle(extraArchive).status).not.toBe(0);

    const source = join(directory, "traversal-source");
    mkdirSync(source);
    writeFileSync(join(source, "escape"), gzipSync(Buffer.from("escape")));
    const traversalArchive = join(directory, "traversal.tar");
    execFileSync("tar", ["-cf", traversalArchive, "--absolute-names", "-C", source, "../escape"]);
    expect(validateBundle(traversalArchive).status).not.toBe(0);
  });

  shellIt("rejects images whose Docker manifest includes unexpected tags", () => {
    const directory = createTempDirectory("tpqr-deploy-test-");
    const archive = createBundle(directory, ["images.tar.gz"], true);
    expect(validateBundle(archive).status).not.toBe(0);
  });

  shellIt("rejects image labels that do not match the requested release SHA", () => {
    const directory = createTempDirectory("tpqr-deploy-test-");
    const archive = createBundle(directory, ["images.tar.gz"], false, true);
    expect(validateBundle(archive).status).not.toBe(0);
  });

  shellIt("rejects symlink members and oversized release archives", () => {
    const directory = createTempDirectory("tpqr-deploy-test-");
    const source = join(directory, "symlink-source");
    mkdirSync(source);
    writeFileSync(join(source, "target.gz"), gzipSync(Buffer.from("target")));
    symlinkSync("target.gz", join(source, "images.tar.gz"));
    const symlinkArchive = join(directory, "symlink.tar");
    execFileSync("tar", ["-cf", symlinkArchive, "-C", source, "images.tar.gz"]);
    expect(validateBundle(symlinkArchive).status).not.toBe(0);

    const oversizedArchive = join(directory, "oversized.tar");
    writeFileSync(oversizedArchive, Buffer.alloc(0));
    truncateSync(oversizedArchive, 2_147_483_649);
    expect(validateBundle(oversizedArchive).status).not.toBe(0);
  });

  shellIt("allows only the fixed deploy command through the SSH wrapper", () => {
    const directory = createTempDirectory("tpqr-ssh-test-");
    const bin = join(directory, "bin");
    const capture = join(directory, "sudo-args.txt");
    mkdirSync(bin);
    const sudoStub = join(bin, "sudo");
    writeFileSync(sudoStub, '#!/bin/sh\nprintf "%s\\n" "$@" > "$TPQR_SUDO_CAPTURE"\n');
    chmodSync(sudoStub, 0o755);

    const sha = "a".repeat(40);
    const allowed = spawnSync("bash", [sshHelper], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        SSH_ORIGINAL_COMMAND: `deploy ${sha} smoke_test-1`,
        TPQR_SUDO_CAPTURE: capture,
      },
    });
    expect(allowed.status).toBe(0);
    expect(readFileSync(capture, "utf8").trim().split("\n")).toEqual([
      "-n",
      "/usr/local/sbin/tpqr-deploy-root",
      sha,
      "smoke_test-1",
    ]);

    for (const command of [
      `deploy ${sha} smoke;id`,
      `deploy ${sha} $(id)`,
      `deploy ${"g".repeat(40)} smoke`,
      `deploy ${sha} invalid/slug`,
    ]) {
      const blocked = spawnSync("bash", [sshHelper], {
        encoding: "utf8",
        env: { ...process.env, SSH_ORIGINAL_COMMAND: command },
      });
      expect(blocked.status).not.toBe(0);
    }
  });
});
