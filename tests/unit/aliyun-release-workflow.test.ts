import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/release-aliyun.yml", "utf8");
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
const compose = readFileSync("infra/aliyun/docker-compose.release.yml", "utf8");
const deployClient = readFileSync("scripts/deploy-aliyun.sh", "utf8");
const deploySsh = readFileSync("infra/aliyun/tpqr-deploy-ssh", "utf8");
const deployRoot = readFileSync("infra/aliyun/tpqr-deploy-root", "utf8");
const installer = readFileSync("infra/aliyun/install-deploy-user.sh", "utf8");
const codeowners = readFileSync(".github/CODEOWNERS", "utf8");

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
    expect(installer).toContain("baseline_sha=$2");
    expect(installer).toContain('ln -s "$baseline_dir" "$current_link.new"');
  });

  it("keeps root Compose server-owned and limits uploaded releases to images", () => {
    expect(workflow).toContain("-C \"$RUNNER_TEMP/tpqr-release\" images.tar.gz");
    expect(workflow).not.toContain("cp infra/aliyun/docker-compose.release.yml");
    expect(deployRoot).toContain("fixed_compose_dir=/etc/tpqr-deploy");
    expect(deployRoot).toContain('fixed_compose="$fixed_compose_dir/docker-compose.release.yml"');
    expect(deployRoot).toContain("assert_safe_root_file \"$fixed_compose\" 644");
    expect(deployRoot).toContain("validate_docker_archive() {");
    expect(deployRoot).toContain('expected_tags = {f"tpqr-cn-api:{release_sha}", f"tpqr-cn-gateway:{release_sha}"}');
    expect(deployRoot).toContain("docker image inspect \"tpqr-cn-api:$release_sha\"");
    expect(deployRoot).toContain("docker image inspect \"tpqr-cn-gateway:$release_sha\"");
    expect(installer).toContain('install -o root -g root -m 0644 "$staged_compose" /etc/tpqr-deploy/docker-compose.release.yml');
    expect(codeowners).toContain("/.github/workflows/ @TPB003");
    expect(codeowners).toContain("/infra/aliyun/docker-compose.release.yml @TPB003");
  });

  it("pins every GitHub Action to a full commit SHA", () => {
    const workflows = [workflow, ciWorkflow, readFileSync(".github/workflows/auto-merge.yml", "utf8")];
    for (const source of workflows) {
      const actionRefs = [...source.matchAll(/^[ \t]*(?:-[ \t]*)?uses:[ \t]+([^\s#]+)/gm)].map((match) => match[1]);
      expect(actionRefs.length).toBeGreaterThan(0);
      for (const ref of actionRefs) {
        expect(ref).toMatch(/@[0-9a-f]{40}$/);
      }
    }
  });

  it("validates the current release before installing the restricted deployment user", () => {
    expect(installer).toContain("running-release-sha");
    expect(installer).toContain("the existing deployment state directory must be a real root-owned directory");
    expect(installer).toContain("docker inspect -f '{{.Config.Image}}'");
    expect(installer).toContain("/opt/tpqr/data");
    expect(installer).toContain("aliyun_caddy-data");
    expect(installer).toContain("aliyun_caddy-config");
    expect(installer).toContain('ln -s "$baseline_dir" "$current_link.new"');
  });

  it("validates production Compose with non-production placeholder values", () => {
    expect(ciWorkflow).toContain("TPQR_DOMAIN=example.invalid docker compose");
    expect(ciWorkflow).toContain("infra/aliyun/docker-compose.release.yml config --quiet");
  });

  it("keeps server configuration and persistent data outside versioned images", () => {
    expect(compose).toContain("/opt/tpqr/.env");
    expect(compose).toContain('HOST: "0.0.0.0"');
    expect(compose).toContain("/opt/tpqr/data:/data/tpqr");
    expect(compose).toContain("external: true");
    expect(compose).toContain("aliyun_caddy-data");
    expect(compose).toContain("aliyun_caddy-config");
    expect(deployRoot).toContain('release_root="$state_root/releases"');
    expect(deployRoot).toContain("previous_link");
    expect(deployRoot).toContain("/api/public/$smoke_slug");
    expect(deployRoot).toContain("/s/$smoke_slug");
    expect(deployRoot).toContain('validate_release_bundle "$archive" "$incoming_dir/extracted"');
    expect(deployRoot).toContain('"$release_root"/*');
    expect(deployRoot).not.toContain("docker compose down");
  });
});
