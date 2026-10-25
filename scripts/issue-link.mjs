import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function closingIssueNumber(body) {
  const matches = [...body.matchAll(/\bCloses\s+#([1-9]\d*)\b/gi)];
  if (matches.length !== 1) throw new Error("PR description must contain exactly one Closes #N reference");
  return Number(matches[0][1]);
}

export async function verifyIssueReference(body, repository, token, request = fetch) {
  const issueNumber = closingIssueNumber(body);
  const response = await request(`https://api.github.com/repos/${repository}/issues/${issueNumber}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`Issue #${issueNumber} could not be found in ${repository}`);
  const issue = await response.json();
  if (issue.pull_request) throw new Error(`#${issueNumber} is a pull request, not an issue`);
  return issueNumber;
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!eventPath || !repository || !token) throw new Error("GitHub pull request context is missing");

  const event = JSON.parse(await readFile(eventPath, "utf8"));
  const pullRequest = event.pull_request;
  if (!pullRequest) throw new Error("This check requires a pull request event");
  if (pullRequest.user?.login === "dependabot[bot]") {
    console.log("Dependabot pull requests are exempt from issue linking");
    return;
  }

  const issueNumber = await verifyIssueReference(pullRequest.body ?? "", repository, token);
  console.log(`Pull request links to ${repository} issue #${issueNumber}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Issue link check failed");
    process.exitCode = 1;
  });
}
