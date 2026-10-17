import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);
const jsQrScript = require.resolve("jsqr");

type Envelope<T> = { data?: T };

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

async function decodePreview(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const image = document.querySelector<HTMLImageElement>(".tp-qr-paper img");
    if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return null;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const decode = (window as unknown as { jsQR?: (data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts: "attemptBoth" }) => { data: string } | null }).jsQR;
    if (!context || !decode) return null;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    return decode(pixels.data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
  });
}

async function waitForQrUpdate(page: Page, action: () => Promise<void>) {
  const image = page.locator(".tp-qr-paper img");
  const previous = await image.getAttribute("src");
  await action();
  await expect.poll(() => image.getAttribute("src")).not.toBe(previous);
  await expect.poll(() => image.evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
}

test("QR 预览样式矩阵可以生成并解码，解码器支持图片回退", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "二维码渲染矩阵在桌面 Chromium 项目跑一次即可");
  await page.addInitScript(() => Object.defineProperty(window, "BarcodeDetector", { configurable: true, value: undefined }));
  await authenticate(page, `qr-matrix-${Date.now()}-${testInfo.workerIndex}@active.tpqr.test`);
  await page.goto("/");
  const created = await page.request.post("/api/codes", { data: { title: "二维码解码矩阵", content: { type: "text", title: "二维码解码矩阵", text: "二维码只编码稳定的活码地址" } } });
  expect(created.status()).toBe(201);
  const code = (await json<{ id: string; slug: string }>(created)).data;
  if (!code) throw new Error("创建二维码矩阵测试活码失败");
  const payload = `${new URL(page.url()).origin}/s/${code.slug}`;

  await page.goto(`/app/codes/${code.id}/qr`);
  await page.addScriptTag({ path: jsQrScript });
  await expect(page.getByAltText("活码二维码预览")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".tp-style-options--dots button")).toHaveCount(6);
  const logoBase64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建 Logo 测试画布");
    context.fillStyle = "#2563eb";
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = "#f2efe8";
    context.fillRect(12, 12, 40, 40);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles({ name: "matrix-logo.png", mimeType: "image/png", buffer: Buffer.from(logoBase64, "base64") });
  await expect(page.getByText("中心 Logo 已上传，请保存样式", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Logo 大小")).toBeVisible();

  const dotButtons = page.locator(".tp-style-options--dots button");
  const cornerButtons = page.locator(".tp-style-group").filter({ hasText: "定位角" }).getByRole("button");
  for (let dot = 0; dot < 6; dot += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      await waitForQrUpdate(page, async () => {
        await dotButtons.nth(dot).click();
        await cornerButtons.nth(corner).click();
      });
      expect(await decodePreview(page), `dot style ${dot}, finder style ${corner}`).toBe(payload);
    }
  }

  const logoSize = page.getByLabel("Logo 大小");
  for (const [key, size] of [["Home", 32], ["ArrowRight", 56], ["End", 128]] as const) {
    await waitForQrUpdate(page, async () => {
      await logoSize.focus();
      if (key === "ArrowRight") {
        await logoSize.press("Home");
        for (let step = 0; step < 6; step += 1) await logoSize.press("ArrowRight");
      } else {
        await logoSize.press(key);
      }
    });
    await expect(logoSize).toHaveValue(String(size));
    expect(await decodePreview(page), `logo size ${size}`).toBe(payload);
  }

  const margin = page.getByLabel("安全边距");
  for (const [key, value] of [["Home", 0], ["End", 48]] as const) {
    await waitForQrUpdate(page, async () => {
      await margin.focus();
      await margin.press(key);
    });
    await expect(margin).toHaveValue(String(value));
    expect(await decodePreview(page), `margin ${value}`).toBe(payload);
  }

  await waitForQrUpdate(page, () => page.getByRole("button", { name: "移除 Logo" }).click());
  await waitForQrUpdate(page, async () => {
    await margin.focus();
    await margin.press("Home");
    for (let step = 0; step < 8; step += 1) await margin.press("ArrowRight");
  });
  await expect(margin).toHaveValue("16");
  await waitForQrUpdate(page, () => page.locator('input[aria-label="前景色 Hex"]').fill("#FFFFFF"));
  await waitForQrUpdate(page, () => page.locator('input[aria-label="背景色 Hex"]').fill("#111519"));
  await expect.poll(() => decodePreview(page)).toBe(payload);

  const pngBase64 = await page.locator(".tp-qr-paper img").evaluate((image) => {
    const source = image as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法导出 QR 测试图");
    context.drawImage(source, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.goto("/decoder");
  await page.locator('input[type="file"]').setInputFiles({ name: "generated-qr.png", mimeType: "image/png", buffer: Buffer.from(pngBase64, "base64") });
  await expect(page).toHaveURL(new RegExp(`/s/${code.slug}$`), { timeout: 20000 });
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 20000 });
});

test("四种二维码导出格式都包含边框说明且可扫", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "四种文件格式的二维码导出在桌面 Chromium 项目验证一次即可");
  await page.addInitScript(() => {
    const createObjectURL = URL.createObjectURL.bind(URL);
    (window as unknown as { __qrDownloadBlob: Blob | null }).__qrDownloadBlob = null;
    URL.createObjectURL = (object) => {
      if (object instanceof Blob && object.type.startsWith("image/")) (window as unknown as { __qrDownloadBlob: Blob | null }).__qrDownloadBlob = object;
      return createObjectURL(object);
    };
  });
  await authenticate(page, `qr-frame-${Date.now()}-${testInfo.workerIndex}@active.tpqr.test`);
  await page.goto("/");
  const created = await page.request.post("/api/codes", { data: { title: "二维码边框导出", content: { type: "text", title: "二维码边框导出", text: "边框文字应随二维码一起导出" } } });
  expect(created.status()).toBe(201);
  const code = (await json<{ id: string; slug: string }>(created)).data;
  if (!code) throw new Error("创建边框导出测试活码失败");
  const payload = `${new URL(page.url()).origin}/s/${code.slug}`;

  await page.goto(`/app/codes/${code.id}/qr`);
  await page.addScriptTag({ path: jsQrScript });
  await expect(page.getByAltText("活码二维码预览")).toBeVisible({ timeout: 20000 });
  await page.getByLabel("显示边框说明").check();
  await page.getByLabel("边框说明文字").fill("扫码查看详情");
  await expect(page.locator(".tp-qr-frame-preview")).toHaveText("扫码查看详情");

  for (const [format, mime] of [["png", "image/png"], ["svg", "image/svg+xml"], ["webp", "image/webp"], ["jpg", "image/jpeg"]] as const) {
    await page.getByLabel("下载格式").selectOption(format);
    await page.evaluate(() => { (window as unknown as { __qrDownloadBlob: Blob | null }).__qrDownloadBlob = null; });
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载", exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`, "i"));
    await expect.poll(() => page.evaluate(() => (window as unknown as { __qrDownloadBlob: Blob | null }).__qrDownloadBlob?.type)).toBe(mime);
    const exported = await page.evaluate(async () => {
      const blob = (window as unknown as { __qrDownloadBlob: Blob | null; jsQR?: (data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts: "attemptBoth" }) => { data: string } | null }).__qrDownloadBlob;
      if (!blob) throw new Error("二维码导出没有 Blob");
      if (blob.type === "image/svg+xml") {
        const svg = new DOMParser().parseFromString(await blob.text(), "image/svg+xml").documentElement;
        return { size: blob.size, width: Number.parseFloat(svg.getAttribute("width") ?? "0"), height: Number.parseFloat(svg.getAttribute("height") ?? "0"), frameText: svg.querySelector("text")?.textContent ?? "", decoded: "" };
      }
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("无法读取导出二维码");
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const qrPixels = context.getImageData(0, 0, canvas.width, canvas.width);
      const decode = (window as unknown as { jsQR?: (data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts: "attemptBoth" }) => { data: string } | null }).jsQR;
      let darkFooterPixels = 0;
      for (let y = Math.max(0, canvas.height - 52); y < canvas.height - 4; y += 1) for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels.data[offset] < 140 && pixels.data[offset + 1] < 140 && pixels.data[offset + 2] < 140) darkFooterPixels += 1;
      }
      bitmap.close();
      return { size: blob.size, width: canvas.width, height: canvas.height, frameText: "", decoded: decode?.(qrPixels.data, qrPixels.width, qrPixels.height, { inversionAttempts: "attemptBoth" })?.data ?? "", darkFooterPixels };
    });
    expect(exported.size).toBeGreaterThan(100);
    expect(exported.height).toBeGreaterThan(exported.width);
    if (format === "svg") expect(exported.frameText).toBe("扫码查看详情");
    else {
      expect(exported.decoded).toBe(payload);
      expect(exported.darkFooterPixels).toBeGreaterThan(0);
    }
  }
});
