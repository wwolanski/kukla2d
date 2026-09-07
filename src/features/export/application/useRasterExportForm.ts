import { useEffect, useMemo, useState } from "react";

import type { Animation, ProjectDocument } from "@kukla2d/contracts";

import { resolveAnimations } from "@/io/resolveAnimations";

import {
  getDefaultExportFormat,
  getExportVariantForSelection,
} from "@/features/export/domain/exportVariantRegistry";
import type {
  ExportFormat,
  ExportTypeId,
} from "@/features/export/domain/exportVariantRegistry.types.js";
import { suggestSpritesheetLayouts } from "@/features/export/domain/spritesheetLayout";

import type { ExportProgress } from "./exportApplicationTypes.types.js";
import type { ExportableAnimation } from "@/io/resolveAnimations.types.js";

const EMPTY_ARRAY: readonly Animation[] = [];

interface AnimationStoreSnapshot {
  activeAnimationId?: string | null;
  fps?: number;
}

interface RasterExportFormOptions {
  open: boolean;
  project: ProjectDocument | null | undefined;
  animStore: AnimationStoreSnapshot | null | undefined;
}

function countAnimationFrames(
  animation: ExportableAnimation,
  fps: number,
): number {
  return Math.max(1, Math.round(((animation?.duration ?? 2000) / 1000) * fps));
}

function useRasterExportFormImpl({
  open,
  project,
  animStore,
}: RasterExportFormOptions) {
  const [type, setTypeState] = useState<ExportTypeId>("sequence");
  const [format, setFormat] = useState<ExportFormat>("png");
  const [animTarget, setAnimTarget] = useState("staging");
  const [exportFps, setExportFps] = useState(24);
  const [outputScale, setOutputScale] = useState(100);
  const [bgMode, setBgMode] = useState<"transparent" | "custom">("transparent");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [exportDest, setExportDest] = useState<"download" | "folder" | "zip">(
    "zip",
  );
  const [spriteSheetColumns, setSpriteSheetColumns] = useState(1);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const animations = project?.animations ?? EMPTY_ARRAY;
  const targetAnims = resolveAnimations(
    animations,
    animTarget,
    animStore?.activeAnimationId,
  );
  const frameCounts = targetAnims.map((animation) =>
    countAnimationFrames(animation, exportFps),
  );
  const maxFrameCount = frameCounts.length > 0 ? Math.max(...frameCounts) : 0;
  const totalFrameCount = frameCounts.reduce((sum, count) => sum + count, 0);
  const outputWidth = Math.max(
    1,
    Math.round(((project?.canvas?.width ?? 1) * outputScale) / 100),
  );
  const outputHeight = Math.max(
    1,
    Math.round(((project?.canvas?.height ?? 1) * outputScale) / 100),
  );
  const spriteSheetLayouts = useMemo(
    () =>
      suggestSpritesheetLayouts({
        frameCount: Math.max(1, maxFrameCount),
        frameWidth: outputWidth,
        frameHeight: outputHeight,
      }),
    [maxFrameCount, outputWidth, outputHeight],
  );
  const variant = getExportVariantForSelection(type, format);
  const expectedArtifactCount =
    type === "sequence" ? totalFrameCount : targetAnims.length;
  const canDownloadSingleFile = expectedArtifactCount === 1;

  const setType = (nextType: ExportTypeId): void => {
    setTypeState(nextType);
    setFormat(getDefaultExportFormat(nextType) ?? "png");
  };

  useEffect(() => {
    if (!open) return;
    const active = animations.find(
      (animation) => animation.id === animStore?.activeAnimationId,
    );
    const initial = active ?? animations[0];
    setAnimTarget(initial?.id ?? "staging");
    setExportFps(initial?.fps ?? animStore?.fps ?? 24);
  }, [open, animations, animStore?.activeAnimationId, animStore?.fps]);

  useEffect(() => {
    if (!open || spriteSheetLayouts.length === 0) return;
    setSpriteSheetColumns(spriteSheetLayouts[0]!.columns);
  }, [open, type, animTarget, exportFps, outputScale, spriteSheetLayouts]);

  useEffect(() => {
    if (!open) return;
    setExportDest(canDownloadSingleFile ? "download" : "zip");
  }, [open, type, animTarget, exportFps, canDownloadSingleFile]);

  const hasFolderSupport =
    typeof window !== "undefined" && "showDirectoryPicker" in window;

  return {
    frame: {
      type,
      setType,
      format,
      setFormat,
      variantId: variant?.id ?? null,
      animTarget,
      setAnimTarget,
      exportFps,
      setExportFps,
      outputScale,
      setOutputScale,
      bgMode,
      setBgMode,
      bgColor,
      setBgColor,
      exportDest,
      setExportDest,
      targetAnims,
      totalFrameCount,
      maxFrameCount,
      expectedArtifactCount,
      canDownloadSingleFile,
      spriteSheetColumns,
      setSpriteSheetColumns,
      spriteSheetLayouts,
      isExporting,
      hasFolderSupport,
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

export const useRasterExportForm = (
  ...args: Parameters<typeof useRasterExportFormImpl>
): ReturnType<typeof useRasterExportFormImpl> =>
  useRasterExportFormImpl(...args);
