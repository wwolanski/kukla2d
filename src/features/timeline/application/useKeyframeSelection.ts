import { useState, useRef, useCallback } from "react";

import {
  toAnimationTargetId,
  type Animation,
  type AnimationId,
  type AnimationTargetId,
  type Track,
} from "@kukla2d/contracts";

import type { ProjectActions } from "@/store/project/projectStoreTypes.types.js";

import { moveKeyframesPreflight } from "@/domain/moveKeyframesPreflight";
import type { MoveKeyframesPreflightResult } from "@/domain/moveKeyframesPreflight.types.js";

import { clamp } from "@/lib/math";

import {
  parseKeyframeAddressSet,
  collectTrackKeyframeAddresses,
  keyframeAddressToString,
} from "../application/keyframeAddress.js";
import { LAYOUT } from "../domain/timelineLayout.js";
import { msToFrame, frameToMs } from "../domain/timelineTime.js";

import type { VisibleTimelineRow } from "./buildTimelineTrackRows.types.js";
import type { KeyframeAddress } from "./keyframeAddress.types.js";
import type { RefObject } from "react";

interface SelectionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface KeyframePreview {
  active: true;
  valid: boolean;
  deltaMs: number;
  targetFrameByAddress: Record<string, number>;
  reasonCode: string | null;
  message: string | null;
}

interface DragContext {
  type: "playhead" | "keyframe" | "box" | null;
  startX: number;
  startY: number;
  rectLeft: number;
  rectTop: number;
  startScrollX: number;
  startScrollY: number;
  startFrame: number;
  origKeyframes: KeyframeAddress[];
  deltaMs: number;
  durationMs: number;
  previewResult: MoveKeyframesPreflightResult | null;
}

const EMPTY_DRAG_CONTEXT: DragContext = {
  type: null,
  startX: 0,
  startY: 0,
  rectLeft: 0,
  rectTop: 0,
  startScrollX: 0,
  startScrollY: 0,
  startFrame: 0,
  origKeyframes: [],
  deltaMs: 0,
  durationMs: 0,
  previewResult: null,
};

interface PointerInput {
  clientX: number;
  clientY?: number;
  shiftKey?: boolean;
  target?: EventTarget | null;
  stopPropagation?: () => void;
}

interface KeyframeSelectionOptions {
  rulerRef: RefObject<HTMLElement | null>;
  trackAreaRef: RefObject<HTMLElement | null>;
  animation: Animation | null;
  xToFrame: (clientX: number) => number;
  startFrame: number;
  endFrame: number;
  totalFrames: number;
  fps: number;
  activeAnimationId: AnimationId | null;
  seekFrame: (frame: number) => boolean | void;
  moveKeyframes: ProjectActions["moveAnimationKeyframes"];
  flattenedRows?: readonly VisibleTimelineRow[];
  onMoveBlocked?: (message: string) => void;
}

function trackTargetId(track: Track): string {
  return track.targetId;
}

function moveBlockMessage(reasonCode: string): string {
  if (reasonCode === "boomerang_generated_range")
    return "Cannot move into locked BOOMERANG generated range";
  if (reasonCode === "collision")
    return "Keyframe already exists at this frame";
  if (reasonCode === "negative_time")
    return "Keyframe cannot move before frame 0";
  if (reasonCode === "exceeds_duration")
    return "Keyframe cannot move past end of animation";
  return "Keyframe cannot be moved to this frame";
}

function buildSelectionAddresses(
  animation: Animation | null,
  targetId: AnimationTargetId,
  properties: string | readonly string[] | null,
  timeMs: number,
): string[] {
  if (!animation) return [];
  const propertySet = properties
    ? new Set<string>(
        typeof properties === "string" ? [properties] : properties,
      )
    : null;
  const matchingTracks = animation.tracks.filter(
    (track) =>
      trackTargetId(track) === targetId &&
      (!propertySet || propertySet.has(track.property)),
  );
  return collectTrackKeyframeAddresses(matchingTracks, timeMs).map((address) =>
    keyframeAddressToString(address),
  );
}

function useKeyframeSelectionImpl({
  rulerRef,
  trackAreaRef,
  animation,
  xToFrame,
  startFrame,
  endFrame,
  totalFrames,
  fps,
  activeAnimationId,
  seekFrame,
  moveKeyframes,
  flattenedRows = [],
  onMoveBlocked,
}: KeyframeSelectionOptions) {
  const [selectedKeyframes, setSelectedKeyframes] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [keyframePreview, setKeyframePreview] =
    useState<KeyframePreview | null>(null);

  const dragCtx = useRef<DragContext>({ ...EMPTY_DRAG_CONTEXT });

  const onRulerPointerDown = useCallback(
    (e: PointerInput) => {
      dragCtx.current = { ...EMPTY_DRAG_CONTEXT, type: "playhead" };
      const frame = xToFrame(e.clientX);
      seekFrame(clamp(frame, startFrame, endFrame));

      const handleMove = (ev: PointerEvent) => {
        const frame = xToFrame(ev.clientX);
        seekFrame(clamp(frame, startFrame, endFrame));
      };
      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        dragCtx.current.type = null;
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [xToFrame, seekFrame, startFrame, endFrame],
  );

  const onKeyframePointerDown = useCallback(
    (
      e: PointerInput,
      targetId: AnimationTargetId,
      propertiesOrTime: string | readonly string[] | number,
      optionalTimeMs?: number,
    ) => {
      e.stopPropagation?.();
      const properties =
        optionalTimeMs === undefined || typeof propertiesOrTime === "number"
          ? null
          : propertiesOrTime;
      const timeMs =
        optionalTimeMs ??
        (typeof propertiesOrTime === "number" ? propertiesOrTime : 0);

      const addresses = buildSelectionAddresses(
        animation,
        targetId,
        properties,
        timeMs,
      );
      if (addresses.length === 0) return;
      let newSel = new Set<string>(selectedKeyframes);

      if (e.shiftKey) {
        const hasAll = addresses.every((address) => newSel.has(address));
        for (const address of addresses) {
          if (hasAll) newSel.delete(address);
          else newSel.add(address);
        }
        setSelectedKeyframes(newSel);
      } else {
        const hasAll =
          addresses.length === newSel.size &&
          addresses.every((address) => newSel.has(address));
        if (!hasAll) {
          newSel = new Set(addresses);
          setSelectedKeyframes(newSel);
        }
      }

      const orig = parseKeyframeAddressSet(newSel);
      const durationMs = animation?.duration ?? 2000;

      dragCtx.current = {
        ...EMPTY_DRAG_CONTEXT,
        type: "keyframe",
        startX: e.clientX,
        startFrame: msToFrame(timeMs, fps),
        origKeyframes: orig,
        deltaMs: 0,
        durationMs,
      };

      const handleMove = (ev: PointerEvent) => {
        const dragFrameDelta =
          xToFrame(ev.clientX) - dragCtx.current.startFrame;
        if (dragFrameDelta !== 0) {
          const deltaMs = frameToMs(dragFrameDelta, fps);
          const minTimeMs = dragCtx.current.origKeyframes.reduce(
            (min, item) => Math.min(min, item.timeMs),
            Infinity,
          );
          const maxTimeMs = dragCtx.current.origKeyframes.reduce(
            (max, item) => Math.max(max, item.timeMs),
            -Infinity,
          );
          const upperBound = dragCtx.current.durationMs - maxTimeMs;
          const clampedDeltaMs = clamp(deltaMs, -minTimeMs, upperBound);
          dragCtx.current.deltaMs = clampedDeltaMs;

          if (animation && activeAnimationId) {
            const preflight = moveKeyframesPreflight(animation, {
              keyframes: dragCtx.current.origKeyframes,
              deltaMs: clampedDeltaMs,
            });
            dragCtx.current.previewResult = preflight;
            setKeyframePreview({
              active: true,
              valid: preflight.valid,
              deltaMs: clampedDeltaMs,
              targetFrameByAddress: preflight.valid
                ? preflight.targetFrameByAddress
                : {},
              reasonCode: preflight.valid ? null : preflight.reasonCode,
              message: preflight.valid
                ? null
                : moveBlockMessage(preflight.reasonCode),
            });
          }
        } else {
          dragCtx.current.previewResult = null;
          setKeyframePreview(null);
        }
      };

      const handleUp = () => {
        const result = dragCtx.current.previewResult;
        if (
          dragCtx.current.deltaMs !== 0 &&
          activeAnimationId &&
          (!result || result.valid)
        ) {
          moveKeyframes({
            animationId: activeAnimationId,
            keyframes: dragCtx.current.origKeyframes,
            deltaMs: dragCtx.current.deltaMs,
          });

          const nextSel = new Set(
            dragCtx.current.origKeyframes.map((item) =>
              keyframeAddressToString({
                targetId: item.targetId,
                property: item.property,
                timeMs: clamp(
                  item.timeMs + dragCtx.current.deltaMs,
                  0,
                  dragCtx.current.durationMs,
                ),
              }),
            ),
          );
          setSelectedKeyframes(nextSel);
        } else if (dragCtx.current.deltaMs !== 0 && result && !result.valid) {
          onMoveBlocked?.(moveBlockMessage(result.reasonCode));
        }
        setKeyframePreview(null);
        dragCtx.current.previewResult = null;
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        dragCtx.current.type = null;
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [
      selectedKeyframes,
      animation,
      activeAnimationId,
      fps,
      xToFrame,
      moveKeyframes,
      onMoveBlocked,
    ],
  );

  const onTrackAreaPointerDown = useCallback(
    (e: PointerInput) => {
      const target = e.target instanceof Element ? e.target : null;
      if (
        target?.closest(".keyframe-diamond") ||
        target?.closest(".ruler-track")
      )
        return;
      if (!trackAreaRef.current) return;

      const rulerRect = rulerRef.current?.getBoundingClientRect();
      if (rulerRect && e.clientX >= rulerRect.left) {
        const frame = xToFrame(e.clientX);
        seekFrame(clamp(frame, startFrame, endFrame));
      }

      if (!e.shiftKey) setSelectedKeyframes(new Set());

      const rect = trackAreaRef.current.getBoundingClientRect();
      const clientY = e.clientY ?? 0;
      dragCtx.current = {
        ...EMPTY_DRAG_CONTEXT,
        type: "box",
        startX: e.clientX,
        startY: clientY,
        rectLeft: rect.left + LAYOUT.LABEL_W,
        rectTop: rect.top,
        startScrollX: trackAreaRef.current.scrollLeft,
        startScrollY: trackAreaRef.current.scrollTop,
      };

      setSelectionBox({
        x:
          e.clientX - rect.left - LAYOUT.LABEL_W + dragCtx.current.startScrollX,
        y: clientY - rect.top + dragCtx.current.startScrollY,
        w: 0,
        h: 0,
      });

      const handleMove = (ev: PointerEvent) => {
        const dx = ev.clientX - dragCtx.current.startX;
        const dy = ev.clientY - dragCtx.current.startY;

        const currentTrackArea = trackAreaRef.current;
        if (!currentTrackArea) return;
        const scrollDx =
          currentTrackArea.scrollLeft - dragCtx.current.startScrollX;
        const scrollDy =
          currentTrackArea.scrollTop - dragCtx.current.startScrollY;

        let bx =
          dragCtx.current.startX -
          dragCtx.current.rectLeft +
          dragCtx.current.startScrollX;
        let by =
          dragCtx.current.startY -
          dragCtx.current.rectTop +
          dragCtx.current.startScrollY;
        let bw = dx + scrollDx;
        let bh = dy + scrollDy;

        if (bw < 0) {
          bx += bw;
          bw = Math.abs(bw);
        }
        if (bh < 0) {
          by += bh;
          bh = Math.abs(bh);
        }

        setSelectionBox({ x: bx, y: by, w: bw, h: bh });
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        dragCtx.current.type = null;

        if (animation) {
          setSelectionBox((prevBox) => {
            if (prevBox && prevBox.w > 5 && prevBox.h > 5) {
              const newSel = new Set<string>(
                e.shiftKey ? selectedKeyframes : [],
              );
              const rows = flattenedRows.length > 0 ? flattenedRows : null;

              if (rows) {
                for (let rIndex = 0; rIndex < rows.length; rIndex++) {
                  const entry = rows[rIndex];
                  if (!entry) continue;
                  if (entry.type !== "property") continue;
                  const propRow = entry.row;
                  const rowY = LAYOUT.RULER_H + rIndex * LAYOUT.ROW_H;

                  if (
                    rowY + LAYOUT.ROW_H > prevBox.y &&
                    rowY < prevBox.y + prevBox.h
                  ) {
                    for (const timeMs of propRow.times) {
                      const frame = msToFrame(timeMs, fps);
                      const frac = (frame - startFrame) / totalFrames;
                      if (frac >= 0 && frac <= 1) {
                        const rulerWidth =
                          rulerRef.current?.getBoundingClientRect().width;
                        const trackW =
                          rulerWidth === undefined
                            ? 0
                            : rulerWidth - 2 * LAYOUT.TRACK_PAD;
                        if (trackW) {
                          const kfX = LAYOUT.TRACK_PAD + frac * trackW;
                          if (kfX > prevBox.x && kfX < prevBox.x + prevBox.w) {
                            for (const propertyRow of propRow.propertyRows) {
                              if (!propertyRow.times.includes(timeMs)) continue;
                              newSel.add(
                                keyframeAddressToString({
                                  targetId: toAnimationTargetId(
                                    propRow.targetId,
                                  ),
                                  property: propertyRow.property,
                                  timeMs,
                                }),
                              );
                            }
                          }
                        }
                      }
                    }
                  }
                }
              } else {
                const trackRows = Array.from(
                  new Map(
                    animation.tracks.map((t) => [trackTargetId(t), t]),
                  ).keys(),
                );

                for (let rIndex = 0; rIndex < trackRows.length; rIndex++) {
                  const nodeId = trackRows[rIndex];
                  if (nodeId === undefined) continue;
                  const rowY = LAYOUT.RULER_H + rIndex * LAYOUT.ROW_H;

                  if (
                    rowY + LAYOUT.ROW_H > prevBox.y &&
                    rowY < prevBox.y + prevBox.h
                  ) {
                    const tracksForNode = animation.tracks.filter(
                      (t) => trackTargetId(t) === nodeId,
                    );
                    const times = [
                      ...new Set(
                        tracksForNode.flatMap((t) =>
                          t.keyframes.map((k) => k.time),
                        ),
                      ),
                    ];

                    for (const timeMs of times) {
                      const frame = msToFrame(timeMs, fps);
                      const frac = (frame - startFrame) / totalFrames;
                      if (frac >= 0 && frac <= 1) {
                        const rulerWidth =
                          rulerRef.current?.getBoundingClientRect().width;
                        const trackW =
                          rulerWidth === undefined
                            ? 0
                            : rulerWidth - 2 * LAYOUT.TRACK_PAD;
                        if (trackW) {
                          const kfX = LAYOUT.TRACK_PAD + frac * trackW;
                          if (kfX > prevBox.x && kfX < prevBox.x + prevBox.w) {
                            const addresses = collectTrackKeyframeAddresses(
                              tracksForNode,
                              timeMs,
                            );
                            for (const address of addresses) {
                              newSel.add(keyframeAddressToString(address));
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
              setSelectedKeyframes(newSel);
            }
            return null;
          });
        } else {
          setSelectionBox(null);
        }
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [
      animation,
      flattenedRows,
      startFrame,
      endFrame,
      totalFrames,
      fps,
      selectedKeyframes,
      xToFrame,
      seekFrame,
      rulerRef,
      trackAreaRef,
    ],
  );

  const clearSelection = useCallback(() => {
    setSelectedKeyframes(new Set());
  }, []);

  return {
    selectedKeyframes,
    selectionBox,
    keyframePreview,
    setSelectedKeyframes,
    onRulerPointerDown,
    onKeyframePointerDown,
    onTrackAreaPointerDown,
    clearSelection,
  };
}

export const useKeyframeSelection = (
  ...args: Parameters<typeof useKeyframeSelectionImpl>
): ReturnType<typeof useKeyframeSelectionImpl> =>
  useKeyframeSelectionImpl(...args);
