export function suggestRole(bounds: { x: number; y: number; width: number; height: number }, areaRatio: number): string {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  if (centerY < 0.34 && centerX < 0.7 && areaRatio > 0.025) return 'head';
  if (centerY > 0.72 && bounds.width >= bounds.height * 0.7) return 'foot';
  if (bounds.height > bounds.width * 2.2 && (centerX < 0.2 || centerX > 0.8)) return 'weapon';
  if (centerY > 0.3 && centerY < 0.75 && areaRatio > 0.02) return 'torso';
  if (centerX < 0.28 || centerX > 0.72) return 'upper-arm';
  return 'custom';
}

