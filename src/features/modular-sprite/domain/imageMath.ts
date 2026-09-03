import type { NormalizedPoint, NormalizedRect } from '@kukla2d/contracts';

import type { PixelRect } from './contracts.js';

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function srgbChannelToLinear(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const red = srgbChannelToLinear(r);
  const green = srgbChannelToLinear(g);
  const blue = srgbChannelToLinear(b);
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return [
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  ];
}

export function normalizedRect(rect: PixelRect, width: number, height: number): NormalizedRect {
  return {
    x: rect.x / width,
    y: rect.y / height,
    width: rect.width / width,
    height: rect.height / height,
  };
}

export function pixelRect(rect: NormalizedRect, width: number, height: number): PixelRect {
  const x = clamp(Math.floor(rect.x * width), 0, Math.max(0, width - 1));
  const y = clamp(Math.floor(rect.y * height), 0, Math.max(0, height - 1));
  const right = clamp(Math.ceil((rect.x + rect.width) * width), x + 1, width);
  const bottom = clamp(Math.ceil((rect.y + rect.height) * height), y + 1, height);
  return { x, y, width: right - x, height: bottom - y };
}

export function normalizedPoint(x: number, y: number, width: number, height: number): NormalizedPoint {
  return {
    x: clamp((x + 0.5) / width, 0, 1),
    y: clamp((y + 0.5) / height, 0, 1),
  };
}

export function rectIntersectionOverUnion(left: NormalizedRect, right: NormalizedRect): number {
  const x0 = Math.max(left.x, right.x);
  const y0 = Math.max(left.y, right.y);
  const x1 = Math.min(left.x + left.width, right.x + right.width);
  const y1 = Math.min(left.y + left.height, right.y + right.height);
  const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = left.width * left.height + right.width * right.height - intersection;
  return union <= 0 ? 0 : intersection / union;
}
