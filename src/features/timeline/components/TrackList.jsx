import { memo, useState } from "react";

import { buildEasingPath } from "./easingPath.js";
import { KeyframeContextMenu } from "./KeyframeContextMenu.jsx";
import { getMissingProperties } from "../application/buildTimelineTrackRows.js";
import { keyframeAddressToString } from "../application/keyframeAddress.js";
import { LAYOUT } from "../domain/timelineLayout.js";
import { msToFrame, frameToMs } from "../domain/timelineTime.js";

const ROW_H = LAYOUT.ROW_H;

function PropertyChooser({
  targetId,
  kind,
  existingProperties,
  onAddProperty,
}) {
  const [open, setOpen] = useState(false);
  const missing = kind ? getMissingProperties(kind, existingProperties) : [];
  if (missing.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-muted/40 text-[10px]"
        title="Add property track"
      >
        +
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 bg-card border border-border/50 shadow-lg rounded py-1 min-w-[120px]">
          {missing.map((spec) => (
            <button
              key={spec.property}
              onClick={(e) => {
                e.stopPropagation();
                onAddProperty(targetId, spec.property);
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-1 text-[11px] hover:bg-muted/40 text-muted-foreground hover:text-foreground"
            >
              {spec.property}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TargetHeader({
  row,
  expanded,
  onToggle,
  sel,
  onAddProperty,
  onToggleBoomerang,
}) {
  const boomerangEnabled = row.boomerangCutoff?.enabled;
  const boomerangDisabledReason =
    !boomerangEnabled && !row.boomerangEligibility?.eligible
      ? row.boomerangEligibility?.reasonCode === "no_authored_keys"
        ? "No authored keyframes — create keys to enable BOOMERANG"
        : row.boomerangEligibility?.reasonCode === "no_room"
          ? "Keys fill entire duration — move last key earlier to enable BOOMERANG"
          : null
      : null;

  return (
    <div
      className={[
        "flex border-b border-border/30 relative text-[11px] cursor-pointer select-none",
        sel.includes(row.targetId) ? "bg-primary/5" : "hover:bg-muted/20",
      ].join(" ")}
      style={{
        height: ROW_H,
        contentVisibility: "auto",
        containIntrinsicSize: `${ROW_H}px`,
      }}
      onClick={onToggle}
    >
      <div
        className="flex items-center gap-1 px-1 border-r border-border/30 shrink-0 text-muted-foreground overflow-hidden sticky left-0 z-30 bg-card shadow-[1px_0_2px_rgba(0,0,0,0.1)]"
        style={{ width: LAYOUT.LABEL_W, minWidth: LAYOUT.LABEL_W }}
        title={row.name}
      >
        <span className="text-[9px] opacity-60">
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
        <span className="truncate">{row.name}</span>
        <div
          className="ml-auto flex items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleBoomerang(row.targetId);
            }}
            className={[
              "w-4 h-4 flex items-center justify-center rounded text-[8px] font-bold transition-colors",
              boomerangEnabled
                ? "bg-primary/20 text-primary hover:bg-primary/30"
                : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/20",
            ].join(" ")}
            title={
              boomerangEnabled
                ? "BOOMERANG active — click to disable"
                : (boomerangDisabledReason ?? "BOOMERANG — play back to start")
            }
            aria-label={
              boomerangEnabled ? "Disable BOOMERANG" : "Enable BOOMERANG"
            }
          >
            B
          </button>
          <PropertyChooser
            targetId={row.targetId}
            kind={row.kind}
            existingProperties={row.tracks.map((t) => t.property)}
            onAddProperty={onAddProperty}
          />
        </div>
      </div>
      <div className="relative flex-1" />
    </div>
  );
}

function PropertyRow({
  propRow,
  parentRow,
  fps,
  startFrame,
  endFrame,
  totalFrames,
  selectedKeyframes,
  frameToPercentage,
  onKeyframePointerDown,
  clipboard,
  copyKeyframe,
  pasteKeyframes,
  setEasingAt,
  removeKeyframeAt,
  loopKeyframes,
  keyframePreview,
}) {
  const boomerangEnabled = parentRow.boomerangCutoff?.enabled;
  const boomerangSourceEndMs = parentRow.boomerangCutoff?.sourceEndMs;
  const boomerangStartFrame =
    boomerangEnabled && boomerangSourceEndMs != null
      ? Math.round((boomerangSourceEndMs / 1000) * fps)
      : null;

  return (
    <div
      className="flex border-b border-border/20 relative text-[11px] hover:bg-muted/10"
      style={{
        height: ROW_H,
        contentVisibility: "auto",
        containIntrinsicSize: `${ROW_H}px`,
      }}
    >
      <div
        className="flex items-center px-2 pl-6 border-r border-border/30 shrink-0 text-muted-foreground/70 overflow-hidden sticky left-0 z-30 bg-card"
        style={{ width: LAYOUT.LABEL_W, minWidth: LAYOUT.LABEL_W }}
        title={`${parentRow.name} · ${propRow.label}`}
      >
        <span className="truncate text-[10px]">{propRow.label}</span>
      </div>

      <div className="relative flex-1 overflow-visible">
        <div
          className="absolute inset-y-0"
          style={{ left: LAYOUT.TRACK_PAD, right: LAYOUT.TRACK_PAD }}
        >
          {boomerangEnabled &&
            boomerangStartFrame != null &&
            (() => {
              const frac = (boomerangStartFrame - startFrame) / totalFrames;
              if (frac < 0 || frac > 1) return null;
              const pct = frac * 100;
              return (
                <div
                  className="absolute inset-y-0 pointer-events-none z-5 flex items-center"
                  style={{ left: `${pct}%`, right: 0 }}
                  title="Auto-generated · BOOMERANG"
                  aria-label="Auto-generated · BOOMERANG"
                >
                  <div className="w-full h-full bg-primary/5 border-l border-primary/20" />
                  <span className="absolute right-1 text-[8px] text-primary/30 tracking-tighter whitespace-nowrap">
                    Auto · BOOMERANG
                  </span>
                </div>
              );
            })()}

          <svg
            className="absolute inset-y-0 w-full h-full pointer-events-none z-10"
            viewBox="0 0 100 10"
            preserveAspectRatio="none"
          >
            {propRow.times.map((tA, i) => {
              if (i >= propRow.times.length - 1) return null;
              const tB = propRow.times[i + 1];
              const fA = msToFrame(tA, fps);
              const fB = msToFrame(tB, fps);
              const perA = ((fA - startFrame) / totalFrames) * 100;
              const perB = ((fB - startFrame) / totalFrames) * 100;
              if (perA > 100 || perB < 0) return null;
              const pathD = buildEasingPath({
                easing: propRow.easingByTime[tA],
                fromPercent: perA,
                toPercent: perB,
              });
              return (
                <path
                  key={`curve-${tA}`}
                  d={pathD}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  opacity="0.4"
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}

            {loopKeyframes &&
              propRow.times.length > 0 &&
              (() => {
                const tLast = propRow.times[propRow.times.length - 1];
                const tEnd = frameToMs(endFrame, fps);
                if (tLast >= tEnd) return null;
                const fA = msToFrame(tLast, fps);
                const fB = endFrame;
                const perA = ((fA - startFrame) / totalFrames) * 100;
                const perB = ((fB - startFrame) / totalFrames) * 100;
                const pathD = buildEasingPath({
                  easing: propRow.easingByTime[tLast] || "ease-both",
                  fromPercent: perA,
                  toPercent: perB,
                });
                return (
                  <path
                    key="curve-loop"
                    d={pathD}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    opacity="0.25"
                    strokeDasharray="4 2"
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })()}
          </svg>

          {propRow.times.map((timeMs) => {
            const frame = msToFrame(timeMs, fps);
            const frac = (frame - startFrame) / totalFrames;
            if (frac < 0 || frac > 1) return null;

            const addresses = propRow.propertyRows
              .filter((row) => row.times.includes(timeMs))
              .map((row) =>
                keyframeAddressToString({
                  targetId: propRow.targetId,
                  property: row.property,
                  timeMs,
                }),
              );
            const isSelected =
              addresses.length > 0 &&
              addresses.every((address) => selectedKeyframes.has(address));

            return (
              <KeyframeContextMenu
                key={timeMs}
                clipboard={clipboard}
                onCopy={() => copyKeyframe(propRow.targetId, timeMs)}
                onPaste={pasteKeyframes}
                onSetEasing={(easingType) =>
                  setEasingAt(
                    propRow.targetId,
                    propRow.properties,
                    timeMs,
                    easingType,
                  )
                }
                onRemove={() =>
                  removeKeyframeAt(propRow.targetId, propRow.properties, timeMs)
                }
              >
                <div
                  data-keyframe-address={
                    addresses.length === 1 ? addresses[0] : undefined
                  }
                  data-keyframe-group={`${propRow.targetId}:${propRow.id}:${timeMs}`}
                  title={`Frame ${frame} — ${parentRow.name} ${propRow.label} — click to select, drag to move`}
                  onPointerDown={(e) =>
                    onKeyframePointerDown(
                      e,
                      propRow.targetId,
                      propRow.properties,
                      timeMs,
                    )
                  }
                  className={[
                    "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 cursor-ew-resize",
                    "rotate-45 border transition-colors z-20 keyframe-diamond",
                    isSelected
                      ? "bg-primary border-primary shadow-[0_0_4px_rgba(255,255,255,0.5)]"
                      : "bg-background border-primary/60 hover:bg-primary/40",
                  ].join(" ")}
                  style={{ left: frameToPercentage(frame) }}
                />
              </KeyframeContextMenu>
            );
          })}

          {loopKeyframes &&
            propRow.times.length > 0 &&
            !propRow.times.includes(frameToMs(endFrame, fps)) && (
              <div
                title={`Virtual loop preview — not a keyframe. At the end boundary, the pose returns to the first key at frame ${msToFrame(propRow.times[0], fps)}.`}
                aria-label={`Virtual loop preview, returns to frame ${msToFrame(propRow.times[0], fps)}`}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border border-primary/50 border-dashed bg-background/80 text-primary/70 z-10 pointer-events-none flex items-center justify-center text-[10px] leading-none"
                style={{ left: frameToPercentage(endFrame) }}
              >
                ↩
              </div>
            )}

          {keyframePreview?.active &&
            propRow.propertyRows.map((propertyRow) => {
              return propRow.times.map((timeMs) => {
                const address = `${propRow.targetId}::${propertyRow.property}::${timeMs}`;
                const nextTimeMs =
                  keyframePreview.targetFrameByAddress[address];
                if (nextTimeMs == null) return null;
                const nextFrame = msToFrame(nextTimeMs, fps);
                const frac = (nextFrame - startFrame) / totalFrames;
                if (frac < 0 || frac > 1) return null;
                const isValid = keyframePreview.valid;
                return (
                  <div
                    key={`ghost-${address}`}
                    title={
                      isValid
                        ? `Preview: frame ${Math.round(nextFrame)}`
                        : keyframePreview.message ||
                          `Blocked: ${keyframePreview.reasonCode}`
                    }
                    className={[
                      "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 z-15 pointer-events-none transition-opacity",
                      isValid
                        ? "bg-primary/30 border border-primary/60"
                        : "bg-destructive/25 border border-destructive/60",
                    ].join(" ")}
                    style={{ left: frameToPercentage(nextFrame) }}
                  />
                );
              });
            })}
        </div>
      </div>
    </div>
  );
}

function TrackListImpl({
  trackRows,
  expandedTargets,
  onToggleTarget,
  onToggleBoomerang,
  fps,
  startFrame,
  endFrame,
  totalFrames,
  selectedKeyframes,
  frameToPercentage,
  onKeyframePointerDown,
  clipboard,
  copyKeyframe,
  pasteKeyframes,
  setEasingAt,
  removeKeyframeAt,
  sel,
  loopKeyframes,
  onAddProperty,
  keyframePreview,
}) {
  return (
    <>
      {trackRows.map((row) => (
        <div key={row.targetId}>
          <TargetHeader
            row={row}
            expanded={expandedTargets.has(row.targetId)}
            onToggle={() => onToggleTarget(row.targetId)}
            sel={sel}
            onAddProperty={onAddProperty}
            onToggleBoomerang={onToggleBoomerang}
          />
          {expandedTargets.has(row.targetId) &&
            row.semanticRows.map((propRow) => (
              <PropertyRow
                key={propRow.id}
                propRow={propRow}
                parentRow={row}
                fps={fps}
                startFrame={startFrame}
                endFrame={endFrame}
                totalFrames={totalFrames}
                selectedKeyframes={selectedKeyframes}
                frameToPercentage={frameToPercentage}
                onKeyframePointerDown={onKeyframePointerDown}
                clipboard={clipboard}
                copyKeyframe={copyKeyframe}
                pasteKeyframes={pasteKeyframes}
                setEasingAt={setEasingAt}
                removeKeyframeAt={removeKeyframeAt}
                loopKeyframes={loopKeyframes}
                keyframePreview={keyframePreview}
              />
            ))}
        </div>
      ))}
    </>
  );
}

// Playback updates parent at animation FPS. Track DOM is authoring state, not
// playback state, so keep hundreds of keyframes out of that render path.
export const TrackList = memo(TrackListImpl);
