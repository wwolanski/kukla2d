import type { BackgroundAnalysis, RgbaImageData } from '../contracts.js';

export function analyzeModularSpriteBackground(image: RgbaImageData): BackgroundAnalysis {
  const { data, width, height } = image;
  const borderIndices: number[] = [];
  for (let x = 0; x < width; x += 1) {
    borderIndices.push(x, (height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    borderIndices.push(y * width, y * width + width - 1);
  }

  let transparent = 0;
  const bins = new Map<number, { count: number; red: number; green: number; blue: number }>();
  for (const pixelIndex of borderIndices) {
    const offset = pixelIndex * 4;
    const alpha = data[offset + 3] ?? 0;
    if (alpha < 16) transparent += 1;
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
    const bin = bins.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    bin.count += 1;
    bin.red += red;
    bin.green += green;
    bin.blue += blue;
    bins.set(key, bin);
  }

  const borderCount = Math.max(1, borderIndices.length);
  if (transparent / borderCount >= 0.5) {
    return { mode: 'alpha', color: { r: 0, g: 0, b: 0 }, confidence: transparent / borderCount };
  }

  let dominant = { count: 0, red: 0, green: 0, blue: 0 };
  for (const bin of bins.values()) if (bin.count > dominant.count) dominant = bin;
  const divisor = Math.max(1, dominant.count);
  return {
    mode: 'chroma',
    color: {
      r: Math.round(dominant.red / divisor),
      g: Math.round(dominant.green / divisor),
      b: Math.round(dominant.blue / divisor),
    },
    confidence: dominant.count / borderCount,
  };
}

