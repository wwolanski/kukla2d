import { useCallback } from "react";

import { clamp } from "@/lib/math";

import { LAYOUT } from "../domain/timelineLayout.js";

import type { RefObject } from "react";

interface TimelineGeometry {
  startFrame: number;
  endFrame: number;
  totalFrames: number;
  xToFrame: (clientX: number) => number;
  frameToPercentage: (frame: number) => string;
}

interface TimelineGeometryOptions {
  rulerRef: RefObject<HTMLElement | null>;
  startFrame: number;
  endFrame: number;
}

export function useTimelineGeometry({
  rulerRef,
  startFrame,
  endFrame,
}: TimelineGeometryOptions): TimelineGeometry {
  const totalFrames = Math.max(endFrame - startFrame, 1);

  const xToFrame = useCallback(
    (clientX: number): number => {
      if (!rulerRef.current) return startFrame;
      const rect = rulerRef.current.getBoundingClientRect();
      const localX = clientX - rect.left - LAYOUT.TRACK_PAD;
      const trackW = rect.width - 2 * LAYOUT.TRACK_PAD;
      const frac = clamp(localX / trackW, 0, 1);
      return Math.round(startFrame + frac * totalFrames);
    },
    [rulerRef, startFrame, totalFrames],
  );

  const frameToPercentage = useCallback(
    (frame: number): string => {
      const frac = (frame - startFrame) / totalFrames;
      return `${frac * 100}%`;
    },
    [startFrame, totalFrames],
  );

  return { startFrame, endFrame, totalFrames, xToFrame, frameToPercentage };
}
