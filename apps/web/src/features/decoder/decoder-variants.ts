export type PixelImage = { width: number; height: number; data: Uint8ClampedArray };
type Decode = (image: PixelImage) => string | null;

export function decodeWithVariants(image: PixelImage, decode: Decode): string | null {
  const value = decode(image);
  if (value) return value;

  const gray = grayscale(image);
  const grayValue = decode(gray);
  if (grayValue) return grayValue;

  const scaledValue = decode(scaleUp2x(gray));
  if (scaledValue) return scaledValue;

  const contrastValue = decode(contrast(gray));
  if (contrastValue) return contrastValue;

  const binaryValue = decode(binarize(gray));
  if (binaryValue) return binaryValue;

  for (const angle of [90, 180, 270] as const) {
    const rotatedValue = decode(rotate(gray, angle));
    if (rotatedValue) return rotatedValue;
  }

  return decode(centerCrop(gray));
}

function grayscale(image: PixelImage): PixelImage {
  const data = new Uint8ClampedArray(image.data);
  for (let i = 0; i < data.length; i += 4) {
    const luminance = Math.round(data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114);
    data[i] = luminance; data[i + 1] = luminance; data[i + 2] = luminance;
  }
  return { ...image, data };
}

function scaleUp2x(image: PixelImage): PixelImage {
  const width = image.width * 2;
  const height = image.height * 2;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const source = ((Math.floor(y / 2) * image.width) + Math.floor(x / 2)) * 4;
    const target = (y * width + x) * 4;
    data.set(image.data.subarray(source, source + 4), target);
  }
  return { width, height, data };
}

function contrast(image: PixelImage): PixelImage {
  const data = new Uint8ClampedArray(image.data);
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.max(0, Math.min(255, (data[i] - 128) * 1.6 + 128));
    data[i] = value; data[i + 1] = value; data[i + 2] = value;
  }
  return { ...image, data };
}

function binarize(image: PixelImage): PixelImage {
  const histogram = new Uint32Array(256);
  let weightedSum = 0;
  const count = image.width * image.height;
  for (let i = 0; i < image.data.length; i += 4) { histogram[image.data[i]] += 1; weightedSum += image.data[i]; }
  let backgroundWeight = 0; let backgroundSum = 0; let bestVariance = -1; let threshold = 128;
  for (let level = 0; level < histogram.length; level += 1) {
    backgroundWeight += histogram[level];
    if (!backgroundWeight) continue;
    const foregroundWeight = count - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += level * histogram[level];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (weightedSum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) { bestVariance = variance; threshold = level; }
  }
  const data = new Uint8ClampedArray(image.data);
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] > threshold ? 255 : 0;
    data[i] = value; data[i + 1] = value; data[i + 2] = value;
  }
  return { ...image, data };
}

function rotate(image: PixelImage, angle: 90 | 180 | 270): PixelImage {
  const width = angle === 180 ? image.width : image.height;
  const height = angle === 180 ? image.height : image.width;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    const targetX = angle === 90 ? image.height - 1 - y : angle === 180 ? image.width - 1 - x : y;
    const targetY = angle === 90 ? x : angle === 180 ? image.height - 1 - y : image.width - 1 - x;
    const source = (y * image.width + x) * 4;
    data.set(image.data.subarray(source, source + 4), (targetY * width + targetX) * 4);
  }
  return { width, height, data };
}

function centerCrop(image: PixelImage): PixelImage {
  const width = Math.max(1, Math.floor(image.width * .8));
  const height = Math.max(1, Math.floor(image.height * .8));
  const left = Math.floor((image.width - width) / 2);
  const top = Math.floor((image.height - height) / 2);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const source = ((top + y) * image.width + left) * 4;
    data.set(image.data.subarray(source, source + width * 4), y * width * 4);
  }
  return { width, height, data };
}
