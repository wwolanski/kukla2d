interface RulerTick {
  frame: number;
  major: boolean;
  label: string | null;
}

interface RulerTickOptions {
  startFrame: number;
  endFrame: number;
  widthPx: number;
  minLabelPx?: number;
}

const TICK_CAP = 2000;
const PREFERRED_MAJOR_INTERVALS = 6;

function sanitizeFinite(v: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return v;
}

function alignedMajorStep(
  range: number,
  preferredIntervals: number,
  maxIntervals: number,
): number | null {
  let bestIntervals = 0;

  for (let intervals = 2; intervals <= maxIntervals; intervals++) {
    if (range % intervals !== 0) continue;
    if (
      bestIntervals === 0 ||
      Math.abs(intervals - preferredIntervals) <
        Math.abs(bestIntervals - preferredIntervals) ||
      (Math.abs(intervals - preferredIntervals) ===
        Math.abs(bestIntervals - preferredIntervals) &&
        intervals > bestIntervals)
    ) {
      bestIntervals = intervals;
    }
  }

  return bestIntervals > 0 ? range / bestIntervals : null;
}

function minorStepFor(majorStep: number): number {
  if (majorStep <= 5) return 1;
  if (majorStep % 5 === 0) return majorStep / 5;
  if (majorStep % 2 === 0) return majorStep / 2;
  return majorStep;
}

export function computeRulerTicks({
  startFrame,
  endFrame,
  widthPx,
  minLabelPx = 36,
}: RulerTickOptions): RulerTick[] {
  let start = Math.round(sanitizeFinite(startFrame, 0));
  let end = Math.round(sanitizeFinite(endFrame, 48));
  widthPx = sanitizeFinite(widthPx, 200);
  minLabelPx = sanitizeFinite(minLabelPx, 36);

  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  const range = end - start;
  if (range <= 0) return [];

  const maxMajorIntervals = Math.max(
    1,
    Math.floor(Math.max(widthPx, 1) / Math.max(minLabelPx, 1)),
  );
  const preferredIntervals = Math.min(
    PREFERRED_MAJOR_INTERVALS,
    maxMajorIntervals,
  );
  const majorStep =
    alignedMajorStep(range, preferredIntervals, maxMajorIntervals) ??
    Math.max(1, Math.round(range / preferredIntervals));
  const minorStep = Math.max(
    minorStepFor(majorStep),
    Math.ceil(range / TICK_CAP),
  );

  const byFrame = new Map<number, RulerTick>();
  const addTick = (
    frame: number,
    {
      major = false,
      label = null,
    }: { major?: boolean; label?: string | null } = {},
  ): void => {
    const current = byFrame.get(frame);
    byFrame.set(frame, {
      frame,
      major: major || current?.major || false,
      label: label ?? current?.label ?? null,
    });
  };

  for (let offset = 0; offset < range; offset += minorStep) {
    addTick(start + offset);
  }
  for (let offset = 0; offset < range; offset += majorStep) {
    const frame = start + offset;
    addTick(frame, { major: true, label: String(frame) });
  }

  addTick(start, { major: true, label: String(start) });
  addTick(end, { major: true, label: String(end) });

  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}
