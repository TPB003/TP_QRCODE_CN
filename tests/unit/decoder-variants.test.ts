import { describe, expect, it } from "vitest";
import { decodeWithVariants } from "@client/features/decoder/decoder-variants";

describe("image decoder variants", () => {
  it("tries grayscale before moving on to larger variants", () => {
    const image = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) };
    const dimensions: string[] = [];
    const result = decodeWithVariants(image, (variant) => {
      dimensions.push(`${variant.width}x${variant.height}:${variant.data[0]}`);
      return variant.data[0] === 76 ? "decoded" : null;
    });
    expect(result).toBe("decoded");
    expect(dimensions).toEqual(["1x1:255", "1x1:76"]);
  });

  it("tries a nearest-neighbor 2x image and stops on the first decode", () => {
    const image = { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255]) };
    const dimensions: string[] = [];
    const result = decodeWithVariants(image, (variant) => {
      dimensions.push(`${variant.width}x${variant.height}`);
      return variant.width === 2 ? "decoded" : null;
    });
    expect(result).toBe("decoded");
    expect(dimensions).toEqual(["1x1", "1x1", "2x2"]);
  });
});
