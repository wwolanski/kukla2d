interface EasingPathOptions {
  easing?: string;
  fromPercent: number;
  toPercent: number;
}

export function buildEasingPath({
  easing,
  fromPercent,
  toPercent,
}: EasingPathOptions): string {
  const x0 = fromPercent;
  const x1 = toPercent;

  if (easing === "stepped") {
    return `M ${x0} 8 L ${x1} 8 L ${x1} 2`;
  }
  if (easing === "linear") {
    return `M ${x0} 8 L ${x1} 2`;
  }
  if (easing === "ease-in") {
    return `M ${x0} 8 C ${x1} 8, ${x1} 8, ${x1} 2`;
  }
  if (easing === "ease-out") {
    return `M ${x0} 8 C ${x0} 2, ${x0} 2, ${x1} 2`;
  }
  const mid = x0 + (x1 - x0) * 0.5;
  return `M ${x0} 8 C ${mid} 8, ${mid} 2, ${x1} 2`;
}
