import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

type Envelope<T = Record<string, unknown>> = { data?: T; error?: { code?: string; message?: string } };

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

test.describe("QR editor workbench layout", () => {
  test("keeps the publish proof visible and lets draft preview close safely", async ({ page }, testInfo) => {
    if (testInfo.project.name === "chromium") await page.setViewportSize({ width: 1440, height: 900 });
    await authenticate(page, `qr-layout-${Date.now()}-${testInfo.project.name}@active.tpqr.test`);
    const created = await page.request.post("/api/codes", {
      data: { title: "布局验收", content: { type: "text", title: "预览标题", text: "预览内容" } },
    });
    expect(created.status()).toBe(201);
    const code = (await json<{ id: string }>(created)).data;
    if (!code) throw new Error("code creation failed");

    await page.goto(`/app/codes/${code.id}/qr`);
    await expect(page.locator(".tp-qr-preview")).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".tp-scan-preview")).toBeVisible();
    await expect(page.locator(".tp-scan-preview")).toContainText("预览内容");
    await expect(page.locator(".tp-style-panel")).toBeVisible();
    await expect(page.locator(".tp-publish-panel")).toBeVisible();
    await expect(page.locator(".tp-qr-editor__stage-tabs")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "发布", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    const savedNotice = page.getByText("草稿已保存", { exact: true });
    await expect(savedNotice).toBeVisible();
    await expect(savedNotice).toBeHidden({ timeout: 5000 });

    await page.locator(".tp-content-fields textarea").fill("未保存也实时更新的扫码内容");
    await expect(page.locator(".tp-scan-preview")).toContainText("未保存也实时更新的扫码内容");

    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width);
    if (testInfo.project.name === "chromium") {
      expect(viewport.scrollHeight).toBeLessThanOrEqual(viewport.height + 2);
      const layout = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector(selector)?.getBoundingClientRect();
          return { left: element?.left ?? 0, top: element?.top ?? 0, bottom: element?.bottom ?? 0 };
        };
        return {
          controls: rect(".tp-editor-controls"),
          qr: rect(".tp-qr-preview"),
          scan: rect(".tp-scan-preview"),
          publish: rect(".tp-publish-panel"),
          scrollbarWidth: getComputedStyle(document.querySelector(".tp-qr-editor")!).scrollbarWidth,
        };
      });
      expect(layout.controls.left).toBeLessThan(layout.qr.left);
      expect(layout.qr.left).toBeLessThan(layout.scan.left);
      expect(layout.publish.bottom).toBeLessThanOrEqual(viewport.height);
      expect(layout.scrollbarWidth).toBe("none");
    }

    await page.getByRole("button", { name: "预览", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "草稿预览" })).toBeVisible();
    await expect(page.getByRole("button", { name: "关闭预览" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "草稿预览" }).getByRole("button", { name: "复制文字" })).toHaveCSS("color", "rgb(15, 23, 42)");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "草稿预览" })).toHaveCount(0);

    await page.getByRole("button", { name: "预览", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "草稿预览" })).toBeVisible();
    await page.locator(".tp-preview-modal").click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole("dialog", { name: "草稿预览" })).toHaveCount(0);
  });

  test("keeps URL draft preview inside the editor", async ({ page }, testInfo) => {
    await authenticate(page, `qr-url-preview-${Date.now()}-${testInfo.project.name}@active.tpqr.test`);
    const created = await page.request.post("/api/codes", {
      data: { title: "网址预览验收", content: { type: "url", title: "预览网址", url: "https://example.com/docs" } },
    });
    expect(created.status()).toBe(201);
    const code = (await json<{ id: string }>(created)).data;
    if (!code) throw new Error("code creation failed");

    await page.goto(`/app/codes/${code.id}/qr`);
    await expect(page.locator(".tp-scan-preview")).toContainText("扫码后将自动跳转到");
    await expect(page.locator(".tp-scan-preview")).toContainText("example.com");
    await page.getByRole("button", { name: "预览", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "草稿预览" })).toBeVisible();
    await expect(page.getByRole("link", { name: "安全打开" })).toHaveAttribute("href", "https://example.com/docs");
    await expect(page).toHaveURL(new RegExp(`/app/codes/${code.id}/qr$`));
  });

  test("renders image, video, audio, file, and contact in the live scan preview", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "content model coverage runs once on desktop");
    await authenticate(page, `qr-content-preview-${Date.now()}@active.tpqr.test`);
    const created = await page.request.post("/api/codes", {
      data: { title: "多类型预览验收", content: { type: "image", assetId: "00000000-0000-4000-8000-000000000000", title: "", alt: "" } },
    });
    expect(created.status()).toBe(201);
    const code = (await json<{ id: string; revision: number }>(created)).data;
    if (!code) throw new Error("code creation failed");

    await page.goto(`/app/codes/${code.id}/qr`);
    await expect(page.locator(".tp-scan-preview")).toContainText("图片加载失败");
    await page.locator(".tp-content-fields input[type=file]").setInputFiles(path.join(process.cwd(), "tmp", "fixtures", "sample-image.png"));
    await expect(page.locator(".tp-scan-preview__viewport .public-image-only")).toBeVisible();
    await expect(page.locator(".tp-scan-preview")).not.toContainText("图片加载失败");

    async function uploadAsset(name: string, mimeType: string, buffer: Buffer) {
      const uploaded = await page.request.post("/api/assets", {
        multipart: { file: { name, mimeType, buffer } },
      });
      expect(uploaded.status()).toBe(201);
      const asset = (await json<{ id: string }>(uploaded)).data;
      if (!asset) throw new Error(`asset upload failed: ${name}`);
      return asset.id;
    }

    const imageAssetId = await uploadAsset("preview.png", "image/png", await readFile(path.join(process.cwd(), "tmp", "fixtures", "sample-image.png")));
    const videoAssetId = await uploadAsset("preview.mp4", "video/mp4", Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 1]));
    const audioAssetId = await uploadAsset("preview.wav", "audio/wav", await readFile(path.join(process.cwd(), "tmp", "fixtures", "sample-audio.wav")));
    const fileAssetId = await uploadAsset("preview.pdf", "application/pdf", Buffer.from("%PDF-1.4\n"));
    const cases: Array<{ content: Record<string, unknown>; selector: string; expectedText?: string; expectedAlt?: string }> = [
      { content: { type: "image", assetId: imageAssetId, alt: "示例图片" }, selector: ".public-content-page--image .public-image-only", expectedAlt: "示例图片" },
      { content: { type: "video", assetId: videoAssetId, title: "示例视频" }, selector: ".public-content-page--video video", expectedText: "示例视频" },
      { content: { type: "audio", assetId: audioAssetId, title: "示例音频", artist: "TP QR" }, selector: ".public-content-page--audio audio", expectedText: "示例音频" },
      { content: { type: "file", assetId: fileAssetId, title: "示例文件", downloadName: "preview.pdf" }, selector: ".public-content-page--file .public-file", expectedText: "示例文件" },
      { content: { type: "contact", firstName: "示例", lastName: "联系人", email: "demo@example.com" }, selector: ".public-content-page--contact .public-contact", expectedText: "示例 联系人" },
    ];

    let revision = code.revision;
    for (const preview of cases) {
      const updated = await page.request.patch(`/api/codes/${code.id}`, { data: { revision, content: preview.content } });
      expect(updated.status()).toBe(200);
      const result = (await json<{ revision: number }>(updated)).data;
      if (!result) throw new Error("code update failed");
      revision = result.revision;
      await page.goto(`/app/codes/${code.id}/qr`);
      const rendered = page.locator(`.tp-scan-preview__viewport ${preview.selector}`);
      await expect(rendered).toBeVisible({ timeout: 20000 });
      if (preview.expectedText) await expect(page.locator(".tp-scan-preview")).toContainText(preview.expectedText);
      if (preview.expectedAlt) await expect(rendered).toHaveAttribute("alt", preview.expectedAlt);
    }
  });

  test("keeps both previews side by side at compact desktop sizes and preserves hidden-scrollbar scrolling", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop design-reference viewport coverage");
    await authenticate(page, `qr-layout-reference-${Date.now()}@active.tpqr.test`);
    const created = await page.request.post("/api/codes", {
      data: { title: "双预览尺寸验收", content: { type: "text", title: "长内容", text: "可滚动扫码预览。".repeat(180) } },
    });
    expect(created.status()).toBe(201);
    const code = (await json<{ id: string }>(created)).data;
    if (!code) throw new Error("code creation failed");

    await page.goto(`/app/codes/${code.id}/qr`);
    await expect(page.locator(".tp-qr-preview")).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".tp-scan-preview")).toBeVisible();
    for (const viewportSize of [{ width: 1117, height: 688 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(viewportSize);
      const layout = await page.evaluate(() => {
        const qr = document.querySelector(".tp-qr-preview")?.getBoundingClientRect();
        const scan = document.querySelector(".tp-scan-preview")?.getBoundingClientRect();
        const viewport = document.querySelector(".tp-scan-preview__viewport");
        return {
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          qrLeft: qr?.left ?? 0,
          qrTop: qr?.top ?? 0,
          scanLeft: scan?.left ?? 0,
          scanTop: scan?.top ?? 0,
          scrollbarWidth: viewport ? getComputedStyle(viewport).scrollbarWidth : "",
        };
      });
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
      expect(layout.scanLeft).toBeGreaterThan(layout.qrLeft);
      expect(Math.abs(layout.scanTop - layout.qrTop)).toBeLessThanOrEqual(2);
      expect(layout.scrollbarWidth).toBe("none");
    }

    const viewport = page.locator(".tp-scan-preview__viewport");
    await viewport.hover();
    await page.mouse.wheel(0, 300);
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await viewport.evaluate((element) => { element.scrollTop = 0; });
    await viewport.focus();
    await page.keyboard.press("PageDown");
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  });

  test("keeps the mobile action bar usable at 375px", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile viewport coverage");
    await page.setViewportSize({ width: 375, height: 812 });
    await authenticate(page, `qr-layout-375-${Date.now()}@active.tpqr.test`);
    const created = await page.request.post("/api/codes", {
      data: { title: "移动布局验收", content: { type: "text", title: "预览标题", text: "预览内容" } },
    });
    expect(created.status()).toBe(201);
    const code = (await json<{ id: string }>(created)).data;
    if (!code) throw new Error("code creation failed");

    await page.goto(`/app/codes/${code.id}/qr`);
    await expect(page.locator(".tp-qr-preview")).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".tp-scan-preview")).toBeVisible();
    await expect(page.locator(".tp-publish-panel__actions")).toBeVisible();
    for (const viewportSize of [{ width: 375, height: 812 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewportSize);
      const viewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.querySelector("#root")?.scrollWidth ?? 0, previewRight: document.querySelector(".tp-qr-preview")?.getBoundingClientRect().right ?? 0 }));
      expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
      expect(viewport.previewRight).toBeLessThanOrEqual(viewport.width + 1);
    }
    const actionBar = page.locator(".tp-publish-panel__actions");
    const initialActionBarTop = await actionBar.evaluate((element) => element.getBoundingClientRect().top);
    expect(initialActionBarTop).toBeGreaterThanOrEqual(0);
    expect(await actionBar.evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(844);
    const editor = page.locator(".tp-qr-editor");
    await editor.evaluate((element) => { element.scrollTop = 0; });
    await editor.focus();
    await page.keyboard.press("PageDown");
    await expect.poll(() => editor.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect.poll(() => actionBar.evaluate((element) => element.getBoundingClientRect().top)).toBe(initialActionBarTop);
  });

  test("keeps initial load errors visible", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop failure-state coverage");
    await authenticate(page, `qr-load-error-${Date.now()}@active.tpqr.test`);
    await page.goto("/app/codes/00000000-0000-4000-8000-000000000000/qr");
    const error = page.getByRole("alert");
    await expect(error).toContainText("活码不存在", { timeout: 20000 });
    await page.waitForTimeout(3600);
    await expect(error).toContainText("活码不存在");
  });
});
