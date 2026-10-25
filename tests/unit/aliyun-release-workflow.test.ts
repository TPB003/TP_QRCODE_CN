import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/release-aliyun.yml", "utf8");
const compose = readFileSync("infra/aliyun/docker-compose.release.yml", "utf8");
const deployClient = readFileSync("scripts/deploy-aliyun.sh", "utf8");
const deploySsh = readFileSync("infra/aliyun/tpqr-deploy-ssh", "utf8");
const deployRoot = readFileSync("infra/aliyun/tpqr-deploy-root", "utf8");
const installer = readFileSync("infra/aliyun/install-deploy-user.sh", "utf8");

describe("Aliyun production release", () => {
  it("waits for successful main CI and serializes protected production deployments", () => {
    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("name: production");
    expect(workflow).toContain("vars.ALIYUN_DEPLOY_ENABLED == 'true'");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' || vars.ALIYUN_DEPLOY_ENABLED == 'true'");
    expect(workflow).toContain("github.event_name != 'workflow_dispatch' && vars.ALIYUN_DEPLOY_ENABLED != 'true'");
  });

  it("uses a fixed deployment protocol and never evaluates a stored shell command", () => {
    expect(workflow).not.toContain("ALIYUN_DEPLOY_COMMAND");
    expect(workflow).not.toContain("bash -c");
    expect(deployClient).toContain('"deploy $release_sha $smoke_slug"');
    expect(deploySsh).toContain("SSH_ORIGINAL_COMMAND");
    expect(deploySsh).toContain("/usr/local/sbin/tpqr-deploy-root");
    expect(installer).toContain('restrict,command="/usr/local/sbin/tpqr-deploy-ssh"');
    expect(installer).not.toContain("usermod -aG docker");
  });

  it("keeps server configuration and persistent data outside versioned images", () => {
    expect(compose).toContain("/opt/tpqr/.env");
    expect(compose).toContain("/opt/tpqr/data:/data/tpqr");
    expect(compose).toContain("external: true");
    expect(compose).toContain("aliyun_caddy-data");
    expect(compose).toContain("aliyun_caddy-config");
    expect(deployRoot).toContain("/var/lib/tpqr-deploy/releases");
    expect(deployRoot).toContain("previous_link");
    expect(deployRoot).toContain("/api/public/$smoke_slug");
    expect(deployRoot).toContain("/s/$smoke_slug");
    expect(deployRoot).not.toContain("docker compose down");
  });
});
