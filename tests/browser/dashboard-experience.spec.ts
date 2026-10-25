import { expect, test, type Page } from "@playwright/test";

type Envelope<T> = { data?: T };

async function authenticate(page: Page, email: string) {
  const requested = await page.request.post("/api/auth/request-code", { data: { email } });
  expect(requested.status()).toBe(200);
  const requestBody = (await requested.json()) as Envelope<{ testCode?: string }>;
  const verified = await page.request.post("/api/auth/verify-code", { data: { email, code: requestBody.data?.testCode ?? "123456" } });
  expect(verified.status()).toBe(200);
}

test("dashboard explains empty data, creates a selected content type, and fits mobile code cards", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await authenticate(page, `dashboard-experience-${Date.now()}-${testInfo.project.name}@active.tpqr.test`);

  await page.goto("/app");
  await expect(page.locator(".dashboard-trend__empty")).toContainText("暂无统计数据");
  await expect(page.getByRole("button", { name: "创建第一张活码" })).toBeVisible();

  await page.getByRole("button", { name: "创建第一张活码" }).click();
  const createDialog = page.getByRole("dialog", { name: "新建活码" });
  await expect(createDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(createDialog).not.toBeVisible();

  await page.getByRole("button", { name: "新建活码", exact: true }).click();
  await page.getByLabel("活码名称").fill("工作台体验验收");
  await page.getByLabel("内容类型").selectOption("url");
  await page.getByRole("button", { name: "创建并编辑" }).click();
  await expect(page).toHaveURL(/\/app\/codes\/[0-9a-f-]+\/qr$/);
  await expect(page.getByRole("tab", { name: "网址" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("textbox", { name: "安全网址" })).toHaveValue("http://127.0.0.1:5173/");
  await expect(page.locator(".tp-content-types [role=tab]")).toHaveCount(7);

  await page.goto("/app?view=codes");
  const card = page.locator(".dashboard-table__row").filter({ hasText: "工作台体验验收" });
  await expect(card).toBeVisible();
  if (mobile) {
    await expect(page.locator(".dashboard-table__head")).toBeHidden();
    await expect(card.locator('[data-label="类型"]')).toHaveAttribute("data-label", "类型");
    for (const viewportSize of [{ width: 390, height: 844 }, { width: 375, height: 812 }]) {
      await page.setViewportSize(viewportSize);
      const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, rootWidth: document.querySelector("#root")?.scrollWidth ?? 0 }));
      expect(sizes.rootWidth).toBeLessThanOrEqual(sizes.width + 1);
    }
  } else {
    await expect(page.locator(".dashboard-table__head")).toBeVisible();
  }
});
