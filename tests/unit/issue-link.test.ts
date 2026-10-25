import { describe, expect, it, vi } from "vitest";
import { closingIssueNumber, verifyIssueReference } from "../../scripts/issue-link.mjs";

describe("pull request issue links", () => {
  it("accepts one closing reference", () => {
    expect(closingIssueNumber("Summary\n\nCloses #27")).toBe(27);
    expect(closingIssueNumber("closes #4")).toBe(4);
  });

  it("rejects missing or multiple closing references", () => {
    expect(() => closingIssueNumber("No linked issue")).toThrow("exactly one");
    expect(() => closingIssueNumber("Closes #3 and closes #4")).toThrow("exactly one");
  });

  it("verifies the referenced item exists as an issue in this repository", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: "Feature" }), { status: 200 }));
    await expect(verifyIssueReference("Closes #27", "TPB003/TP_QRCODE_CN", "test-token", request as unknown as typeof fetch)).resolves.toBe(27);
    expect(request).toHaveBeenCalledWith("https://api.github.com/repos/TPB003/TP_QRCODE_CN/issues/27", expect.any(Object));
  });

  it("rejects missing issues and pull requests used as issue links", async () => {
    const missing = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    await expect(verifyIssueReference("Closes #27", "TPB003/TP_QRCODE_CN", "test-token", missing as unknown as typeof fetch)).rejects.toThrow("could not be found");

    const pullRequest = vi.fn().mockResolvedValue(new Response(JSON.stringify({ pull_request: {} }), { status: 200 }));
    await expect(verifyIssueReference("Closes #29", "TPB003/TP_QRCODE_CN", "test-token", pullRequest as unknown as typeof fetch)).rejects.toThrow("not an issue");
  });
});
