import jsQR from "jsqr";
import { decodeWithVariants } from "./decoder-variants";

const worker = self as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<{ bitmap: ImageBitmap }>) => void): void;
  postMessage(message: { value: string | null }): void;
};
worker.addEventListener("message", (event: MessageEvent<{ bitmap: ImageBitmap }>) => {
  const { bitmap } = event.data;
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("pixel-context-unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    const value = decodeWithVariants(pixels, (image) => jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" })?.data ?? null);
    worker.postMessage({ value });
  } catch {
    worker.postMessage({ value: null });
  } finally {
    bitmap.close();
  }
});
