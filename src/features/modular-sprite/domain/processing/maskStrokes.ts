import type { ModularSpriteMaskStroke, ModularSpriteProcessingRecipe } from '@kukla2d/contracts';

export function paintCircle(target: Uint8Array | Uint8ClampedArray, width: number, height: number, x: number, y: number, radius: number, value: number): void {
  const radiusSquared = radius * radius;
  const minX = Math.max(0, Math.floor(x - radius));
  const maxX = Math.min(width - 1, Math.ceil(x + radius));
  const minY = Math.max(0, Math.floor(y - radius));
  const maxY = Math.min(height - 1, Math.ceil(y + radius));
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const deltaX = px - x;
      const deltaY = py - y;
      if (deltaX * deltaX + deltaY * deltaY <= radiusSquared) target[py * width + px] = value;
    }
  }
}

export function rasterizeStroke(target: Uint8Array | Uint8ClampedArray, width: number, height: number, stroke: ModularSpriteMaskStroke, value: number): void {
  const radius = Math.max(1, stroke.radius * Math.max(width, height));
  let previous: { x: number; y: number } | null = null;
  for (const point of stroke.points) {
    const current = { x: point.x * (width - 1), y: point.y * (height - 1) };
    if (!previous) {
      paintCircle(target, width, height, current.x, current.y, radius, value);
    } else {
      const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
      const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.5)));
      for (let step = 0; step <= steps; step += 1) {
        const amount = step / steps;
        paintCircle(target, width, height, previous.x + (current.x - previous.x) * amount, previous.y + (current.y - previous.y) * amount, radius, value);
      }
    }
    previous = current;
  }
}

export function matteStrokesPass(matte: Uint8ClampedArray, rgba: Uint8ClampedArray, recipe: ModularSpriteProcessingRecipe, width: number, height: number): void {
  const alphaStrokes = recipe.strokes.filter(stroke => stroke.kind === 'foreground' || stroke.kind === 'background');
  if (alphaStrokes.length === 0) return;
  for (const stroke of alphaStrokes) {
    if (stroke.kind === 'foreground') rasterizeStroke(matte, width, height, stroke, 255);
    if (stroke.kind === 'background') rasterizeStroke(matte, width, height, stroke, 0);
  }
  for (let index = 0; index < matte.length; index += 1) rgba[index * 4 + 3] = matte[index] ?? 0;
}

export function detectionStrokesPass(detection: Uint8Array, recipe: ModularSpriteProcessingRecipe, width: number, height: number): Uint8Array | null {
  const hasSplitStroke = recipe.strokes.some(stroke => stroke.kind === 'split');
  const beforeSplit = hasSplitStroke ? new Uint8Array(detection) : null;
  for (const stroke of recipe.strokes) {
    if (stroke.kind === 'split') rasterizeStroke(detection, width, height, stroke, 0);
    if (stroke.kind === 'foreground') rasterizeStroke(detection, width, height, stroke, 1);
    if (stroke.kind === 'background') rasterizeStroke(detection, width, height, stroke, 0);
  }
  return beforeSplit;
}

