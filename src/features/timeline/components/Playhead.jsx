import { LAYOUT } from "../domain/timelineLayout.js";

export function Playhead({ frac, labelWidth, trackPad }) {
  if (frac < 0 || frac > 1) return null;
  const lw = labelWidth ?? LAYOUT.LABEL_W;
  const tp = trackPad ?? LAYOUT.TRACK_PAD;
  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-primary/80 pointer-events-none z-40"
      style={{
        left: `calc(${lw + tp}px + ${frac * 100}% - ${(lw + 2 * tp) * frac}px)`,
      }}
    >
      <div
        className="absolute -top-0 left-1/2 -translate-x-1/2 w-0 h-0
        border-l-[4px] border-l-transparent
        border-r-[4px] border-r-transparent
        border-t-[6px] border-t-primary"
      />
    </div>
  );
}
