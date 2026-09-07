import { useEffect, useMemo, useState } from "react";

import type { Animation, ProjectDocument } from "@kukla2d/contracts";

import { resolveAnimations } from "@/io/resolveAnimations";

import { PHASER_ATLAS_DEFAULTS } from "@/features/export/domain/phaserAtlasContract";

import type { ExportProgress } from "./exportApplicationTypes.types.js";
import type { ExportableAnimation } from "@/io/resolveAnimations.types.js";

const EMPTY_ARRAY: readonly Animation[] = [];

interface AnimationStoreSnapshot {
  activeAnimationId?: string | null;
  fps?: number;
}

interface PhaserAtlasExportFormOptions {
  open: boolean;
  project: ProjectDocument | null | undefined;
  animStore: AnimationStoreSnapshot | null | undefined;
  projectName: string;
}

function countAnimationFrames(
  animation: ExportableAnimation,
  fps: number,
): number {
  return Math.max(1, Math.round(((animation?.duration ?? 2000) / 1000) * fps));
}

function usePhaserAtlasExportFormImpl({
  open,
  project,
  animStore,
  projectName,
}: PhaserAtlasExportFormOptions) {
  const [animTarget, setAnimTarget] = useState("staging");
  const [exportFps, setExportFps] = useState<number>(PHASER_ATLAS_DEFAULTS.fps);
  const [outputScale, setOutputScale] = useState<number>(
    PHASER_ATLAS_DEFAULTS.scale,
  );
  const [trim, setTrim] = useState(PHASER_ATLAS_DEFAULTS.trim);
  const [padding, setPadding] = useState<number>(PHASER_ATLAS_DEFAULTS.padding);
  const [maxPageSize, setMaxPageSize] = useState<number>(
    PHASER_ATLAS_DEFAULTS.maxPageSize,
  );
  const [loop, setLoop] = useState(PHASER_ATLAS_DEFAULTS.loop);
  const [exportDest, setExportDest] = useState<"zip" | "folder">(
    PHASER_ATLAS_DEFAULTS.destination,
  );
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const animations = project?.animations ?? EMPTY_ARRAY;
  const targetAnims = resolveAnimations(
    animations,
    animTarget,
    animStore?.activeAnimationId,
  );
  const frameCounts = useMemo(
    () => targetAnims.map((a) => countAnimationFrames(a, exportFps)),
    [targetAnims, exportFps],
  );
  const totalFrameCount = frameCounts.reduce((sum, c) => sum + c, 0);

  const outputWidth = Math.max(
    1,
    Math.round(((project?.canvas?.width ?? 1) * outputScale) / 100),
  );
  const outputHeight = Math.max(
    1,
    Math.round(((project?.canvas?.height ?? 1) * outputScale) / 100),
  );
  const estimatedUntrimmedPixels = outputWidth * outputHeight * totalFrameCount;

  const hasFolderSupport =
    typeof window !== "undefined" && "showDirectoryPicker" in window;

  useEffect(() => {
    if (!open) return;
    const active = animations.find(
      (a) => a.id === animStore?.activeAnimationId,
    );
    const initial = active ?? animations[0];
    setAnimTarget(initial?.id ?? "staging");
    setExportFps(initial?.fps ?? animStore?.fps ?? PHASER_ATLAS_DEFAULTS.fps);
  }, [open, animations, animStore?.activeAnimationId, animStore?.fps]);

  useEffect(() => {
    if (!open) return;
    setExportDest(hasFolderSupport ? "folder" : "zip");
  }, [open, hasFolderSupport]);

  return {
    frame: {
      variantId: "phaser_atlas",
      animTarget,
      setAnimTarget,
      exportFps,
      setExportFps,
      outputScale,
      setOutputScale,
      trim,
      setTrim,
      padding,
      setPadding,
      maxPageSize,
      setMaxPageSize,
      loop,
      setLoop,
      exportDest,
      setExportDest,
      targetAnims,
      totalFrameCount,
      estimatedUntrimmedPixels,
      hasFolderSupport,
      isExporting,
      projectName,
    },
    status: {
      progress,
      setProgress,
      isExporting,
      setIsExporting,
      exportError,
      setExportError,
    },
  };
}

export const usePhaserAtlasExportForm = (
  ...args: Parameters<typeof usePhaserAtlasExportFormImpl>
): ReturnType<typeof usePhaserAtlasExportFormImpl> =>
  usePhaserAtlasExportFormImpl(...args);
