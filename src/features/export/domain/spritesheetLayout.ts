interface SpritesheetLayout {
  columns: number;
  rows: number;
  capacity: number;
}

interface SpritesheetLayoutSuggestion extends SpritesheetLayout {
  sheetWidth: number;
  sheetHeight: number;
  sheetAspect: number;
  score: number;
  recommended: boolean;
}

function positiveInt(value: unknown, fallback = 1): number {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function resolveSpritesheetLayout(
  frameCount: number,
  columns?: number,
): Readonly<SpritesheetLayout> {
  const count = positiveInt(frameCount);
  const safeColumns = Math.min(count, positiveInt(columns));
  return Object.freeze({
    columns: safeColumns,
    rows: Math.ceil(count / safeColumns),
    capacity: safeColumns * Math.ceil(count / safeColumns),
  });
}

export function suggestSpritesheetLayouts({
  frameCount,
  frameWidth,
  frameHeight,
  maxOptions = 12,
}: {
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  maxOptions?: number;
}): readonly Readonly<SpritesheetLayoutSuggestion>[] {
  const count = positiveInt(frameCount);
  const width = positiveInt(frameWidth);
  const height = positiveInt(frameHeight);
  const candidates: Omit<SpritesheetLayoutSuggestion, "recommended">[] = [];

  for (let columns = 1; columns <= count; columns += 1) {
    const layout = resolveSpritesheetLayout(count, columns);
    const sheetAspect = (layout.columns * width) / (layout.rows * height);
    const emptyRatio = (layout.capacity - count) / layout.capacity;
    const aspectPenalty = Math.abs(Math.log(sheetAspect));
    const extremePenalty =
      sheetAspect > 4 || sheetAspect < 0.25
        ? Math.abs(Math.log(sheetAspect / (sheetAspect > 4 ? 4 : 0.25)))
        : 0;
    candidates.push({
      ...layout,
      sheetWidth: layout.columns * width,
      sheetHeight: layout.rows * height,
      sheetAspect,
      score: aspectPenalty + emptyRatio * 2 + extremePenalty * 2,
    });
  }

  candidates.sort(
    (a, b) =>
      a.score - b.score || a.capacity - b.capacity || a.columns - b.columns,
  );
  const limit = Math.max(1, positiveInt(maxOptions));
  const best = candidates[0];
  if (!best) return Object.freeze([]);
  const preferred = [best];

  // Preserve exact factor layouts, then fill remaining slots with best near-square layouts.
  for (const pool of [
    candidates.filter((candidate) => candidate.capacity === count),
    candidates,
  ]) {
    for (const candidate of pool) {
      if (preferred.length >= limit) break;
      if (!preferred.some((item) => item.columns === candidate.columns))
        preferred.push(candidate);
    }
  }

  return Object.freeze(
    preferred.map((layout, index) =>
      Object.freeze({
        ...layout,
        recommended: index === 0,
      }),
    ),
  );
}
