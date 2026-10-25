import fs from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

type Envelope<T = Record<string, unknown>> = { data?: T; error?: { code?: string; message?: string } };

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "chromium") {
    await page.addInitScript(() => Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, get: () => 0 }));
  }
});

async function json<T>(response: { json(): Promise<unknown> }): Promise<Envelope<T>> {
  return (await response.json()) as Envelope<T>;
}

async function authenticate(page: Page, email: string) {
  const request = await page.request.post("/api/auth/request-code", { data: { email } });
  expect(request.status()).toBe(200);
  const requestBody = await json<{ testCode?: string }>(request);
  const verify = await page.request.post("/api/auth/verify-code", { data: { email, code: requestBody.data?.testCode ?? "123456" } });
  expect(verify.status()).toBe(200);
}

test.describe("second-pass product regressions", () => {
  test("the public text page has one title and reports copy success through the fallback path", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: () => Promise.reject(new Error("clipboard permission denied")) },
        });
      } catch {
        // The browser may expose a non-configurable clipboard object; the test still checks visible feedback.
      }
      try {
        Object.defineProperty(document, "execCommand", { configurable: true, value: (command: string) => command === "copy" });
      } catch {
        // Use the native implementation when the browser does not allow replacement.
      }
    });
    await authenticate(page, `public-copy-${Date.now()}-${testInfo.project.name}@active.tpqr.test`);
    const created = await page.request.post("/api/codes", { data: { title: "标题只显示一次", content: { type: "text", title: "标题只显示一次", text: "可复制的正文" } } });
    expect(created.status()).toBe(201);
    const code = (await json<{ id: string; slug: string; revision: number }>(created)).data;
    if (!code) throw new Error("创建回归活码失败");
    const published = await page.request.post(`/api/codes/${code.id}/publish`, { data: { revision: code.revision } });
    expect(published.status()).toBe(200);

    await page.goto(`/s/${code.slug}`);
    await expect(page.locator(".public-content-card__title h1")).toHaveCount(1, { timeout: 20000 });
    await expect(page.locator(".public-text h2")).toHaveCount(0);
    await page.getByRole("button", { name: "复制文字" }).click();
    await expect(page.getByText("已复制", { exact: true })).toBeVisible();
  });

  test("QR actions use a real desktop download or mobile share flow", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile";
    if (mobile) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
        Object.defineProperty(navigator, "share", { configurable: true, value: () => Promise.resolve() });
      });
    }
    await authenticate(page, `qr-download-${Date.now()}-${testInfo.project.name}@active.tpqr.test`);
    const created = await page.request.post("/api/codes", { data: { title: "二维码下载回归", content: { type: "text", title: "二维码下载回归", text: "download" } } });
    expect(created.status()).toBe(201);
    const code = (await json<{ id: string }>(created)).data;
    if (!code) throw new Error("创建下载回归活码失败");
    await page.goto(`/app/codes/${code.id}/qr`);
    await expect(page.getByAltText("活码二维码预览")).toBeVisible({ timeout: 20000 });
    const action = page.getByRole("button", { name: mobile ? "分享 / 下载" : "下载", exact: true });
    await expect(action).toBeVisible();
    if (mobile) {
      await action.click();
      await expect(page.getByRole("status")).toContainText("已打开系统分享");
    } else {
      const downloadEvent = page.waitForEvent("download");
      await action.click();
      const download = await downloadEvent;
      expect(download.suggestedFilename()).toMatch(/\.png$/i);
      const downloadPath = await download.path();
      if (!downloadPath) throw new Error("二维码下载没有生成本地文件");
      expect((await fs.stat(downloadPath)).size).toBeGreaterThan(100);
    }
  });

  test("dashboard navigation exposes separate codes and analytics views", async ({ page }, testInfo) => {
    await authenticate(page, `dashboard-views-${Date.now()}-${testInfo.project.name}@active.tpqr.test`);
    const mobile = testInfo.project.name === "mobile";
    const views = [
      { path: "/app", href: "/app" },
      { path: "/app?view=codes", href: "/app?view=codes" },
      { path: "/app?view=types", href: "/app?view=types" },
      { path: "/app?view=analytics", href: "/app?view=analytics" },
    ];
    const currentNavigation = page.locator('nav[aria-label="工作台导航"] a[aria-current="page"]');
    for (const view of views) {
      await page.goto(view.path);
      await expect(currentNavigation).toHaveCount(1);
      await expect(currentNavigation).toHaveAttribute("href", view.href);
    }

    await page.goto("/app");
    if (mobile) await page.getByRole("button", { name: /打开工作台导航/ }).click();
    const analytics = page.getByRole("link", { name: "扫码统计" });
    await expect(analytics).toBeVisible();
    await analytics.click();
    await expect(page).toHaveURL(/\/app\?view=analytics$/);
    await expect(currentNavigation).toHaveText("扫码统计");
    if (mobile) await expect(page.getByRole("button", { name: /打开工作台导航/ })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("heading", { name: /扫码统计|SCAN DATA/ })).toBeVisible({ timeout: 20000 });

    if (mobile) await page.getByRole("button", { name: /打开工作台导航/ }).click();
    const codes = page.getByRole("link", { name: "我的活码" });
    await expect(codes).toBeVisible();
    await codes.click();
    await expect(page).toHaveURL(/\/app\?view=codes$/);
    await expect(currentNavigation).toHaveText("我的活码");
    await expect(page.getByRole("heading", { name: /我的活码|MY CODES/ })).toBeVisible({ timeout: 20000 });
  });

  test("project navigation reaches each code section and returns from the decoder", async ({ page }, testInfo) => {
    await authenticate(page, `project-navigation-${Date.now()}-${testInfo.project.name}@active.tpqr.test`);
    const created = await page.request.post("/api/codes", { data: { title: "导航回归活码", content: { type: "text", title: "导航回归活码", text: "页面导航测试" } } });
    expect(created.status()).toBe(201);
    const code = (await json<{ id: string }>(created)).data;
    if (!code) throw new Error("创建导航测试活码失败");

    const mobile = testInfo.project.name === "mobile";
    const viewports = mobile ? [{ width: 390, height: 844 }, { width: 375, height: 812 }] : [{ width: 1440, height: 900 }];
    const projectCurrent = page.locator('nav[aria-label="项目导航"] a[aria-current="page"]');
    const sections = [
      { label: "二维码编辑", path: `/app/codes/${code.id}/qr` },
      { label: "版本记录", path: `/app/codes/${code.id}/versions` },
      { label: "扫码统计", path: `/app/codes/${code.id}/analytics` },
      { label: "活码设置", path: `/app/codes/${code.id}/settings` },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(sections[0].path);
      await expect(projectCurrent).toHaveCount(1);
      await expect(projectCurrent).toHaveText(sections[0].label);

      for (const section of sections.slice(1)) {
        if (mobile) await page.getByRole("button", { name: "打开项目导航" }).click();
        await page.getByRole("link", { name: section.label, exact: true }).click();
        await expect(page).toHaveURL(section.path);
        await expect(projectCurrent).toHaveCount(1);
        await expect(projectCurrent).toHaveText(section.label);
        if (mobile) await expect(page.getByRole("button", { name: "打开项目导航" })).toHaveAttribute("aria-expanded", "false");
      }

      if (mobile) await page.getByRole("button", { name: "打开项目导航" }).click();
      await page.getByRole("link", { name: "二维码编辑", exact: true }).click();
      await expect(page).toHaveURL(sections[0].path);
      if (mobile) await page.getByRole("button", { name: "打开项目导航" }).click();
      await page.getByRole("link", { name: "解码器", exact: true }).click();
      await expect(page).toHaveURL("/decoder");
      await expect(page.getByRole("link", { name: "返回工作台" })).toBeVisible();
      await expect(page.getByRole("link", { name: "返回首页" })).toBeVisible();
      await page.getByRole("link", { name: "返回工作台" }).click();
      await expect(page).toHaveURL("/app");
      await expect(page.getByRole("heading", { name: /ACTIVE CODES/ })).toBeVisible();
    }
  });

  test("homepage no longer advertises retired inspection, batch, or fake QR examples", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("tab", { name: "图片" }).first()).toBeVisible({ timeout: 20000 });
    const text = await page.locator("body").innerText();
    for (const retired of ["巡检", "设备巡检", "批量导入", "提交记录", "提交数据", "QR-7F3A", "QR-20260810-A9F7"]) {
      expect(text, `homepage contains retired text: ${retired}`).not.toContain(retired);
    }
    for (const activeType of ["图片", "视频", "音频", "文件", "网址", "名片", "文字"]) {
      expect(text, `homepage is missing active type: ${activeType}`).toContain(activeType);
    }
  });

  test("marketing links point to the right sections and explain login-only actions", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("需登录后使用", { exact: true })).toHaveCount(3);
    await expect(page.getByRole("link", { name: /开始创建活码/ })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("link", { name: /免费创建活码/ })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("link", { name: /免费创建动态二维码/ })).toHaveAttribute("href", "/login");
    await expect(page.locator(".data-cta-section__display")).toHaveCSS("pointer-events", "none");
    await expect(page.getByText("文字、网址与图片共用同一套动态发布流程。", { exact: true })).toBeVisible();
    await expect(page.locator(".workflow-section__heading code")).not.toContainText("VERSION");

    const example = page.locator(".workflow-step__example");
    await expect(example).toContainText("tpqr.co/AB3xY9");
    await expect(example).toContainText("示例");
    await expect(page.getByRole("link", { name: /tpqr\.co\/AB3xY9/ })).toHaveCount(0);
    await page.getByRole("link", { name: "查看发布流程" }).click();
    await expect(page).toHaveURL(/#workflow$/);

    await page.getByRole("link", { name: "进入样式编辑器" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("public scan does not show a branded loading card while content is pending", async ({ page }) => {
    let releaseResponse!: () => void;
    const responsePending = new Promise<void>((resolve) => { releaseResponse = resolve; });
    await page.route("**/api/public/loading-screen-regression", async (route) => {
      await responsePending;
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "NOT_FOUND", message: "not found" } }),
      });
    });

    await page.goto("/s/loading-screen-regression");
    const loadingPage = page.locator(".public-content-page--loading");
    await expect(loadingPage).toBeVisible({ timeout: 20000 });
    await expect(loadingPage).toHaveText("");
    await expect(page.locator(".public-content-card")).toHaveCount(0);
    await expect(page.getByText("正在打开活码", { exact: false })).toHaveCount(0);

    releaseResponse();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 20000 });
    await page.unroute("**/api/public/loading-screen-regression");
  });
});
