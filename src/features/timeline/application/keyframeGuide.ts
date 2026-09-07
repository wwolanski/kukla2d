interface KeyguideFrame {
  frame: number;
  label: "Start" | "Guide" | "End";
}

interface KeyguideOptions {
  startFrame: number;
  endFrame: number;
  fps: number;
  hasVisibleKeyframes: boolean;
}

export function buildKeyguideFrames({
  startFrame,
  endFrame,
  fps,
  hasVisibleKeyframes,
}: KeyguideOptions): KeyguideFrame[] {
  if (hasVisibleKeyframes) return [];

  const frames: KeyguideFrame[] = [];

  const start = Math.floor(startFrame);
  const end = Math.ceil(endFrame);

  frames.push({ frame: start, label: "Start" });

  const interval = Math.max(1, Math.round(fps / 2));
  let current = start + interval;
  while (current < end) {
    frames.push({ frame: current, label: "Guide" });
    current += interval;
  }

  frames.push({ frame: end, label: "End" });

  const seen = new Set<number>();
  return frames.filter((f) => {
    if (seen.has(f.frame)) return false;
    seen.add(f.frame);
    return true;
  });
}
