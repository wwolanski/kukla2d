import { useState, useCallback, useRef, useMemo } from "react";

import {
  computeValueRange,
  fitValueRange,
  applyPropertyRange,
  valueToScreen,
  screenToValue,
  timeToScreenX,
  screenXToTime,
  snapTimeToFrame,
  clampTime,
  clampValue,
  isNumericTrack,
  easingToCubicTuple,
  cubicTupleToEasing,
  handlesFromTuple,
  buildSegmentPath,
  buildGraphPoints,
} from "../application/graphModel.js";
import { parseKeyframeAddress } from "../application/keyframeAddress.js";
import { LAYOUT } from "../domain/timelineLayout.js";

const ROW_H = LAYOUT.ROW_H;
const POINT_R = 4;
const HANDLE_R = 3;

const TRACK_COLORS = [
  "hsl(210, 80%, 55%)",
  "hsl(340, 80%, 55%)",
  "hsl(140, 70%, 45%)",
  "hsl(30, 90%, 55%)",
  "hsl(270, 70%, 55%)",
  "hsl(180, 60%, 45%)",
  "hsl(60, 80%, 50%)",
  "hsl(310, 70%, 55%)",
];

function getTrackColor(index) {
  return TRACK_COLORS[index % TRACK_COLORS.length];
}

function GraphGrid({ valueRange, graphHeight, width }) {
  const ticks = 5;
  const lines = [];
  for (let i = 0; i <= ticks; i++) {
    const y = (i / ticks) * graphHeight;
    const value =
      valueRange.max - (i / ticks) * (valueRange.max - valueRange.min);
    lines.push(
      <g key={`grid-${i}`}>
        <line
          x1={0}
          y1={y}
          x2={width}
          y2={y}
          stroke="currentColor"
          strokeWidth="0.5"
          opacity="0.1"
        />
        <text x={2} y={y + 3} fill="currentColor" fontSize="8" opacity="0.4">
          {Number.isInteger(value) ? value : value.toFixed(1)}
        </text>
      </g>,
    );
  }
  return <g>{lines}</g>;
}

function GraphTrack({ points, color, selectedAddresses }) {
  if (points.length === 0) return null;

  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    segments.push(
      <path
        key={`seg-${p0.address}`}
        d={buildSegmentPath(p0.x, p0.y, p1.x, p1.y, p0.easing)}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />,
    );
  }

  return (
    <g>
      {segments}
      {points.map((p) => {
        const isSel = selectedAddresses.has(p.address);
        return (
          <circle
            key={`pt-${p.address}`}
            cx={p.x}
            cy={p.y}
            r={isSel ? POINT_R + 1 : POINT_R}
            fill={isSel ? color : "var(--background)"}
            stroke={color}
            strokeWidth="1.5"
            data-address={p.address}
            data-type="point"
            style={{ cursor: "grab" }}
          />
        );
      })}
    </g>
  );
}

function CubicHandles({ points, color, selectedAddresses }) {
  const handles = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const tuple = easingToCubicTuple(p0.easing);
    const { outHandle, inHandle } = handlesFromTuple(
      p0.x,
      p0.y,
      p1.x,
      p1.y,
      tuple,
    );

    const p0Selected = selectedAddresses.has(p0.address);
    if (p0Selected) {
      handles.push(
        <g key={`handle-out-${p0.address}`}>
          <line
            x1={p0.x}
            y1={p0.y}
            x2={outHandle.x}
            y2={outHandle.y}
            stroke={color}
            strokeWidth="0.8"
            opacity="0.6"
          />
          <circle
            cx={outHandle.x}
            cy={outHandle.y}
            r={HANDLE_R}
            fill={color}
            stroke="white"
            strokeWidth="0.5"
            data-address={p0.address}
            data-handle="out"
            data-type="handle"
            style={{ cursor: "grab" }}
          />
        </g>,
      );
    }

    const p1Selected = selectedAddresses.has(p1.address);
    if (p1Selected) {
      handles.push(
        <g key={`handle-in-${p1.address}`}>
          <line
            x1={p1.x}
            y1={p1.y}
            x2={inHandle.x}
            y2={inHandle.y}
            stroke={color}
            strokeWidth="0.8"
            opacity="0.6"
          />
          <circle
            cx={inHandle.x}
            cy={inHandle.y}
            r={HANDLE_R}
            fill={color}
            stroke="white"
            strokeWidth="0.5"
            data-address={p1.address}
            data-handle="in"
            data-type="handle"
            style={{ cursor: "grab" }}
          />
        </g>,
      );
    }
  }
  return <g>{handles}</g>;
}

function GraphRow({
  propRow,
  parentRow,
  index,
  selectedKeyframes,
  fps,
  startFrame,
  totalFrames,
  graphHeight,
  graphWidth,
  onCommitEdit,
}) {
  const keyframes = propRow.keyframes.filter(
    (kf) => typeof kf.value === "number",
  );

  const selectedAddresses = useMemo(() => {
    const set = new Set();
    for (const addr of selectedKeyframes) {
      const parsed = parseKeyframeAddress(addr);
      if (
        parsed?.targetId === propRow.targetId &&
        parsed.property === propRow.property
      ) {
        set.add(addr);
      }
    }
    return set;
  }, [selectedKeyframes, propRow.targetId, propRow.property]);

  if (keyframes.length === 0) return null;

  const rawRange = computeValueRange(keyframes);
  const propRange = applyPropertyRange(keyframes, propRow.property);
  const valueRange = propRange || fitValueRange(rawRange);

  const points = buildGraphPoints(
    propRow,
    startFrame,
    totalFrames,
    fps,
    valueRange,
    graphHeight,
  );
  const color = getTrackColor(index);

  return (
    <div
      className="flex border-b border-border/20 relative text-[11px] hover:bg-muted/10"
      style={{ height: ROW_H }}
    >
      <div
        className="flex items-center px-2 pl-6 border-r border-border/30 shrink-0 text-muted-foreground/70 overflow-hidden sticky left-0 z-30 bg-card/60 backdrop-blur-sm"
        style={{ width: LAYOUT.LABEL_W, minWidth: LAYOUT.LABEL_W }}
        title={`${parentRow.name} · ${propRow.property}`}
      >
        <span className="truncate text-[10px]">
          <span
            className="inline-block w-2 h-2 rounded-full mr-1"
            style={{ backgroundColor: color }}
          />
          {propRow.property}
        </span>
      </div>

      <div className="relative flex-1 overflow-visible">
        <div
          className="absolute inset-y-0"
          style={{ left: LAYOUT.TRACK_PAD, right: LAYOUT.TRACK_PAD }}
        >
          <svg
            className="absolute inset-y-0 w-full h-full"
            viewBox={`0 0 ${graphWidth} ${graphHeight}`}
            preserveAspectRatio="none"
            data-track={propRow.id}
          >
            <GraphGrid
              valueRange={valueRange}
              graphHeight={graphHeight}
              width={graphWidth}
            />
            <GraphTrack
              points={points}
              color={color}
              selectedAddresses={selectedAddresses}
            />
            <CubicHandles
              points={points}
              color={color}
              selectedAddresses={selectedAddresses}
            />
          </svg>

          {points.map((p) => {
            const selected = selectedAddresses.has(p.address);
            return selected ? (
              <input
                key={`value-${p.address}`}
                type="number"
                aria-label={`Value ${propRow.targetId} ${propRow.property} ${p.timeMs}`}
                defaultValue={p.value}
                step="any"
                className="absolute z-20 w-14 h-5 text-[10px] text-center bg-input border border-border rounded"
                style={{
                  left: (p.x / graphWidth) * 100 + "%",
                  top: (p.y / graphHeight) * 100 + "%",
                  transform: "translate(-50%, -130%)",
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onBlur={(event) => {
                  const value = clampValue(
                    Number(event.currentTarget.value),
                    propRow.property,
                  );
                  if (Number.isFinite(value) && value !== p.value) {
                    onCommitEdit([
                      {
                        targetId: propRow.targetId,
                        property: propRow.property,
                        originalTimeMs: p.timeMs,
                        timeMs: p.timeMs,
                        value,
                        easing: p.easing,
                      },
                    ]);
                  }
                }}
              />
            ) : (
              <div
                key={`label-${p.address}`}
                className="absolute text-[8px] text-muted-foreground pointer-events-none whitespace-nowrap"
                style={{
                  left: (p.x / graphWidth) * 100 + "%",
                  top: (p.y / graphHeight) * 100 + "%",
                  transform: "translate(-50%, -180%)",
                }}
              >
                {Number.isInteger(p.value) ? p.value : p.value.toFixed(1)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function EditableGraphEditor({
  rows,
  selectedKeyframes,
  fps,
  startFrame,
  totalFrames,
  animation,
  activeAnimationId,
  onCommitEdits,
}) {
  const svgContainerRef = useRef(null);
  const [graphWidth] = useState(400);
  const graphHeight = ROW_H - 2;

  const numericRows = useMemo(() => {
    const result = [];
    let idx = 0;
    for (const row of rows) {
      for (const propRow of row.propertyRows ?? []) {
        if (isNumericTrack(propRow)) {
          result.push({ propRow, parentRow: row, index: idx++ });
        }
      }
    }
    return result;
  }, [rows]);

  const handleCommit = useCallback(
    (edits) => {
      if (!activeAnimationId || edits.length === 0) return;
      onCommitEdits?.({ animationId: activeAnimationId, edits });
    },
    [activeAnimationId, onCommitEdits],
  );

  const onPointerDown = useCallback(
    (e) => {
      const svgEl = e.target.closest("svg[data-track]");
      if (!svgEl) return;
      const type = e.target.getAttribute("data-type");
      const address = e.target.getAttribute("data-address");
      if (!type || !address) return;

      e.stopPropagation();

      const rect = svgEl.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const durationMs = animation?.duration ?? 2000;

      const parsed = parseKeyframeAddress(address);
      if (!parsed) return;
      const { targetId, property, timeMs: origTimeMs } = parsed;
      const track = animation?.tracks?.find(
        (t) => t.targetId === targetId && t.property === property,
      );
      const origKf = track?.keyframes?.find((kf) => kf.time === origTimeMs);
      if (!origKf) return;

      const origValue = origKf.value;
      const origEasing = origKf.easing ?? "ease-both";
      const rawRange = computeValueRange(track.keyframes);
      const propRange = applyPropertyRange(track.keyframes, property);
      const valueRange = propRange || fitValueRange(rawRange);

      if (type === "point") {
        let moved = false;
        const handleMove = (ev) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && !moved) return;
          moved = true;
        };

        const handleUp = (ev) => {
          window.removeEventListener("pointermove", handleMove);
          window.removeEventListener("pointerup", handleUp);
          if (!moved) return;

          const dx = ev.clientX - startX;
          const dPercentX = (dx / rect.width) * 100;
          const newTimeMs = snapTimeToFrame(
            clampTime(
              screenXToTime(
                timeToScreenX(origTimeMs, startFrame, totalFrames, fps) +
                  dPercentX,
                startFrame,
                totalFrames,
                fps,
              ),
              durationMs,
            ),
            fps,
          );
          const newY =
            valueToScreen(origValue, valueRange, graphHeight) +
            (ev.clientY - startY);
          const newValue = clampValue(
            screenToValue(
              Math.max(0, Math.min(graphHeight, newY)),
              valueRange,
              graphHeight,
            ),
            property,
          );

          if (newTimeMs !== origTimeMs || newValue !== origValue) {
            handleCommit([
              {
                targetId,
                property,
                originalTimeMs: origTimeMs,
                timeMs: newTimeMs,
                value: newValue,
                easing: origEasing,
              },
            ]);
          }
        };

        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
      } else if (type === "handle") {
        const handleSide = e.target.getAttribute("data-handle");
        const tuple = easingToCubicTuple(origEasing);

        const nextKf = track?.keyframes?.find((kf) => kf.time > origTimeMs);
        const prevKf = [...(track?.keyframes ?? [])]
          .reverse()
          .find((kf) => kf.time < origTimeMs);

        let moved = false;
        let pendingEasing = origEasing;
        const handleMove = (ev) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && !moved) return;
          moved = true;

          const graphRect = svgEl.getBoundingClientRect();
          const localX = ev.clientX - graphRect.left;
          const localY = ev.clientY - graphRect.top;

          if (handleSide === "out" && nextKf) {
            const nextScreenX =
              timeToScreenX(nextKf.time, startFrame, totalFrames, fps) *
              (graphRect.width / graphWidth);
            const dxNorm = Math.max(0, Math.min(1, localX / nextScreenX));
            const dyNorm =
              (localY - valueToScreen(origValue, valueRange, graphHeight)) /
              (valueToScreen(nextKf.value, valueRange, graphHeight) -
                valueToScreen(origValue, valueRange, graphHeight) || 1);
            tuple[0] = dxNorm;
            tuple[1] = dyNorm;
          } else if (handleSide === "in" && prevKf) {
            const prevScreenX =
              timeToScreenX(prevKf.time, startFrame, totalFrames, fps) *
              (graphRect.width / graphWidth);
            const dxNorm = Math.max(
              0,
              Math.min(
                1,
                (localX -
                  (graphRect.width *
                    timeToScreenX(origTimeMs, startFrame, totalFrames, fps)) /
                    100) /
                  ((graphRect.width *
                    timeToScreenX(origTimeMs, startFrame, totalFrames, fps)) /
                    100 -
                    prevScreenX || 1),
              ),
            );
            const dyNorm =
              (localY - valueToScreen(origValue, valueRange, graphHeight)) /
              (valueToScreen(prevKf.value, valueRange, graphHeight) -
                valueToScreen(origValue, valueRange, graphHeight) || 1);
            tuple[2] = dxNorm;
            tuple[3] = dyNorm;
          }

          pendingEasing = cubicTupleToEasing(tuple);
        };

        const handleUp = () => {
          window.removeEventListener("pointermove", handleMove);
          window.removeEventListener("pointerup", handleUp);
          if (moved && pendingEasing !== origEasing) {
            handleCommit([
              {
                targetId,
                property,
                originalTimeMs: origTimeMs,
                timeMs: origTimeMs,
                value: origValue,
                easing: pendingEasing,
              },
            ]);
          }
        };

        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
      }
    },
    [
      animation,
      startFrame,
      totalFrames,
      fps,
      graphHeight,
      graphWidth,
      handleCommit,
    ],
  );

  return (
    <div className="border-b border-border/40 bg-muted/10">
      <div
        ref={svgContainerRef}
        className="overflow-auto"
        onPointerDown={onPointerDown}
      >
        {numericRows.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-muted-foreground">
            Graph: no numeric tracks yet.
          </div>
        ) : (
          numericRows.map(({ propRow, parentRow, index }) => (
            <GraphRow
              key={propRow.id}
              propRow={propRow}
              parentRow={parentRow}
              index={index}
              selectedKeyframes={selectedKeyframes}
              fps={fps}
              startFrame={startFrame}
              totalFrames={totalFrames}
              graphHeight={graphHeight}
              graphWidth={graphWidth}
              onCommitEdit={handleCommit}
            />
          ))
        )}
      </div>
    </div>
  );
}
