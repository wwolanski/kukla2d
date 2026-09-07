interface WeightColor {
  color: number;
  alpha: number;
}

interface ColorStop {
  readonly t: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const COLOR_STOPS = [
  { t: 0.0, r: 26, g: 58, b: 92 },
  { t: 0.25, r: 34, g: 211, b: 238 },
  { t: 0.5, r: 34, g: 197, b: 94 },
  { t: 0.75, r: 234, g: 179, b: 8 },
  { t: 1.0, r: 239, g: 68, b: 68 },
] as const satisfies readonly ColorStop[];

export function weightToColor(weight: number): WeightColor {
  const clamped = Math.max(0, Math.min(1, weight));

  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const lo = COLOR_STOPS[i];
    const hi = COLOR_STOPS[i + 1];
    if (!lo || !hi) continue;
    if (clamped >= lo.t && clamped <= hi.t) {
      const t = (clamped - lo.t) / (hi.t - lo.t);
      const r = Math.round(lo.r + (hi.r - lo.r) * t);
      const g = Math.round(lo.g + (hi.g - lo.g) * t);
      const b = Math.round(lo.b + (hi.b - lo.b) * t);
      const color = (r << 16) | (g << 8) | b;
      const alpha = 0.15 + clamped * 0.6;
      return { color, alpha };
    }
  }

  return { color: 0xef4444, alpha: 0.75 };
}

export function weightToHex(weight: number): number {
  return weightToColor(weight).color;
}
