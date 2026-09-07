import { LAYOUT } from "../domain/timelineLayout.js";
import { msToFrame } from "../domain/timelineTime.js";

export function Ruler({
  startFrame,
  endFrame,
  fps,
  animation,
  frameToPercentage,
  onPointerDown,
  rulerRef,
  rulerTicks,
}) {
  return (
    <div
      className="sticky top-0 z-40 flex min-w-0 bg-card border-b border-border ruler-track"
      style={{ height: LAYOUT.RULER_H }}
      onPointerDown={onPointerDown}
    >
      <div
        style={{ width: LAYOUT.LABEL_W, minWidth: LAYOUT.LABEL_W }}
        className="border-r border-border shrink-0 sticky left-0 z-50 bg-card"
      />

      <div
        className="relative min-w-0 flex-1 overflow-hidden cursor-col-resize ruler-track"
        ref={rulerRef}
      >
        <div
          className="absolute inset-y-0 pointer-events-none"
          style={{ left: LAYOUT.TRACK_PAD, right: LAYOUT.TRACK_PAD }}
        >
          {rulerTicks.map((t) => {
            const isFirst = t.frame === Math.round(startFrame);
            const isLast = t.frame === Math.round(endFrame);
            return (
              <div
                key={t.frame}
                className="absolute top-0 h-full w-px"
                style={{ left: frameToPercentage(t.frame) }}
              >
                <div
                  className="w-px bg-border/40"
                  style={{
                    height: t.major ? 8 : 4,
                    marginTop: t.major ? 0 : 4,
                  }}
                />
                {t.label !== null && (
                  <span
                    className="absolute top-[9px] text-[9px] text-muted-foreground leading-none select-none whitespace-nowrap"
                    title={
                      isFirst
                        ? `Start boundary: frame ${t.label}`
                        : isLast
                          ? `End boundary: ${endFrame - startFrame} playable frames in this range`
                          : undefined
                    }
                    style={{
                      left: "50%",
                      transform: isFirst
                        ? "translateX(0)"
                        : isLast
                          ? "translateX(-100%)"
                          : "translateX(-50%)",
                    }}
                  >
                    {isFirst
                      ? `${t.label} START`
                      : isLast
                        ? `${t.label} END`
                        : t.label}
                  </span>
                )}
              </div>
            );
          })}
          {(animation?.markers ?? []).map((marker) => {
            const frame = msToFrame(marker.time, fps);
            if (frame < startFrame || frame > endFrame) return null;
            return (
              <div
                key={marker.id}
                className="absolute top-0 h-full"
                style={{
                  left: frameToPercentage(frame),
                  transform: "translateX(-50%)",
                }}
              >
                <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] border-t-yellow-400" />
                <div className="mt-0.5 px-1 rounded bg-yellow-400/20 text-yellow-200 text-[9px] whitespace-nowrap">
                  {marker.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
