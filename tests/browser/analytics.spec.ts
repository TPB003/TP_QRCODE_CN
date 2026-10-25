import { expect, test, type Page } from "@playwright/test";

type Envelope<T> = { data?: T; error?: { code?: string; message?: string } };

async function json<T>(response: { json(): Promise<unknown> }): Promise<Envelope<T>> {
  return (await response.json()) as Envelope<T>;
}

async function authenticate(page: Page, email: string) {
  const request = await page.request.post("/api/auth/request-code", { data: { email } });
  expect(request.status()).toBe(200);
  const requested = await json<{ testCode?: string }>(request);
  const verified = await page.request.post("/api/auth/verify-code", { data: { email, code: requested.data?.testCode ?? "123456" } });
  expect(verified.status()).toBe(200);
}

test.describe("扫码统计", () => {
  test("单码与全局统计可以切换时间范围和指标", async ({ page }, testInfo) => {
    await authenticate(page, `analytics-${Date.now()}-${testInfo.project.name}-${testInfo.workerIndex}@active.tpqr.test`);
    const created = await page.request.post("/api/codes", { data: { title: "统计交互验收", content: { type: "text", title: "统计交互验收", text: "只在本地测试环境写入事件" } } });
    expect(created.status()).toBe(201);
    const code = (await json<{ id: string; slug: string; revision: number }>(created)).data;
    if (!code) throw new Error("创建统计测试活码失败");
    const published = await page.request.post(`/api/codes/${code.id}/publish`, { data: { revision: code.revision } });
    expect(published.status()).toBe(200);

    for (const [index, event] of (["scan", "view", "click", "download", "play"] as const).entries()) {
      const response = await page.request.post(`/api/public/${code.slug}/events`, { data: { event, idempotencyKey: `analytics-${Date.now()}-${index}` } });
      expect(response.status()).toBe(200);
    }

    await page.goto(`/app/codes/${code.id}/analytics`);
    await expect(page.getByRole("heading", { name: "统计交互验收" })).toBeVisible();
    const scans = page.getByRole("tab", { name: /扫码/ });
    await expect(scans).toContainText("1");
    await expect(scans).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: /点击/ }).click();
    await expect(page.getByRole("heading", { name: "最近 30 天点击趋势" })).toBeVisible();
    const sevenDaysResponse = page.waitForResponse((response) => response.url().includes(`/api/codes/${code.id}/analytics?days=7`));
    await page.getByRole("button", { name: "最近 7 天" }).click();
    await sevenDaysResponse;
    await expect(page.getByRole("heading", { name: "最近 7 天点击趋势" })).toBeVisible();

    const dashboardAnalyticsPaths: string[] = [];
    const trackDashboardAnalytics = (request: { url(): string }) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/codes/") && url.pathname.endsWith("/analytics")) dashboardAnalyticsPaths.push(`${url.pathname}${url.search}`);
    };
    page.on("request", trackDashboardAnalytics);
    const defaultSummaryResponse = page.waitForResponse((response) => response.url().includes("/api/codes/analytics?days=30"));
    await page.goto("/app?view=analytics");
    await defaultSummaryResponse;
    const globalRangeResponse = page.waitForResponse((response) => response.url().includes("/api/codes/analytics?days=7"));
    await page.getByRole("button", { name: "最近 7 天" }).click();
    await globalRangeResponse;
    page.off("request", trackDashboardAnalytics);
    expect(dashboardAnalyticsPaths).toContain("/api/codes/analytics?days=30");
    expect(dashboardAnalyticsPaths).toContain("/api/codes/analytics?days=7");
    expect(dashboardAnalyticsPaths).not.toContain(`/api/codes/${code.id}/analytics?days=30`);
    await page.getByRole("tab", { name: "点击", exact: true }).click();
    await expect(page.getByRole("img", { name: "最近 7 天点击趋势" })).toBeVisible();
    await expect(page.locator(".dashboard-analytics__row").filter({ hasText: "统计交互验收" })).toContainText("1");
    expect(await page.locator(".dashboard-trend svg").evaluate((svg) => svg.getBoundingClientRect().width)).toBeGreaterThan(0);
  });

  test("无事件时展示统计空态", async ({ page }, testInfo) => {
    await authenticate(page, `analytics-empty-${Date.now()}-${testInfo.project.name}-${testInfo.workerIndex}@active.tpqr.test`);
    const created = await page.request.post("/api/codes", { data: { title: "无统计数据", content: { type: "text", title: "无统计数据", text: "草稿" } } });
    expect(created.status()).toBe(201);
    const code = (await json<{ id: string }>(created)).data;
    if (!code) throw new Error("创建空统计测试活码失败");
    await page.goto(`/app/codes/${code.id}/analytics`);
    await expect(page.getByText("还没有统计数据，发布二维码后这里会自动更新。")).toBeVisible();
  });
});
