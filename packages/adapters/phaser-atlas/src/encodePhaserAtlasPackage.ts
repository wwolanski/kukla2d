import {
  decodePngDataUrl,
  composePageBlob,
  AbortError,
} from "./browserImage.js";
import {
  packAtlasFrames,
  validatePackLayout,
} from "./domain/phaserAtlasPacker.js";
import { scanAlphaBounds } from "./domain/phaserAtlasTrim.js";
import {
  buildAnimationJson,
  buildMarkerManifest,
} from "./phaserAnimationJson.js";
import {
  buildSingleAtlasJson,
  buildMultiAtlasJson,
} from "./phaserAtlasJson.js";
import {
  buildExportReport,
  buildExampleTs,
  buildReadme,
} from "./phaserPackageDocs.js";

import type { DecodedPng } from "./browserImage.types.js";
import type {
  PackInput,
  PackedPage,
} from "./domain/phaserAtlasPacker.types.js";
import type {
  CapturedFrame,
  EncodeResult,
  ExportArtifact,
  PackageOptions,
} from "./encodePhaserAtlasPackage.types.js";
import type { AnimationInput } from "./phaserAnimationJson.types.js";

export async function encodePhaserAtlasPackage(
  frames: readonly CapturedFrame[],
  options: PackageOptions,
): Promise<EncodeResult> {
  const {
    signal,
    padding,
    maxPageSize,
    trim,
    fps,
    scale,
    loop,
    outputName,
    textureKey,
  } = options;
  const repeat = loop ? -1 : 0;
  const safeRoot = sanitizeName(outputName) || "phaser-export";

  if (signal?.aborted) return cancelled();

  const decoded: DecodedPng[] = [];
  try {
    for (let i = 0; i < frames.length; i++) {
      if (signal?.aborted) return cancelled();
      options.onProgress?.({
        current: i + 1,
        total: frames.length,
        label: `Decoding frame ${i + 1}...`,
      });
      const d = await decodePngDataUrl(frames[i]!.dataUrl, signal);
      decoded.push(d);
    }
  } catch (e: unknown) {
    if (
      e instanceof AbortError ||
      (e instanceof Error && e.name === "AbortError")
    )
      return cancelled();
    throw e;
  }

  if (signal?.aborted) return cancelled();

  const packInputs: PackInput[] = frames.map((f, i) => {
    const d = decoded[i]!;
    if (d.width !== f.sourceWidth || d.height !== f.sourceHeight) {
      throw new Error(
        `Frame ${f.identity} decoded ${d.width}x${d.height} != plan ${f.sourceWidth}x${f.sourceHeight}`,
      );
    }
    const trimResult = scanAlphaBounds(d.width, d.height, d.rgba, trim);
    return {
      identity: f.identity,
      cropX: trimResult.cropX,
      cropY: trimResult.cropY,
      cropW: trimResult.cropW,
      cropH: trimResult.cropH,
      sourceWidth: trimResult.sourceWidth,
      sourceHeight: trimResult.sourceHeight,
      empty: trimResult.empty,
    };
  });

  const packResult = packAtlasFrames(packInputs, padding, maxPageSize);
  if ("code" in packResult) {
    return { ok: false, code: packResult.code, message: packResult.message };
  }

  const layoutErrors = validatePackLayout(packInputs, packResult, padding);
  if (layoutErrors.length > 0) {
    return {
      ok: false,
      code: "PHASER_ATLAS_LAYOUT_INVALID",
      message: layoutErrors.join("; "),
    };
  }

  if (signal?.aborted) return cancelled();

  const pages = packResult.pages;
  const isMulti = pages.length > 1;
  const pageFileNames = pages.map((_, i) =>
    isMulti ? `${safeRoot}-${i}.png` : `${safeRoot}.png`,
  );

  const artifacts: ExportArtifact[] = [];
  for (let pi = 0; pi < pages.length; pi++) {
    if (signal?.aborted) return cancelled();
    const page = pages[pi]!;
    const regionSources = page.regions.map((region) => {
      const frameIdx = frames.findIndex((f) => f.identity === region.name);
      if (frameIdx < 0)
        throw new Error(`Frame not found for region ${region.name}`);
      const d = decoded[frameIdx]!;
      const packInput = packInputs[frameIdx]!;
      return {
        rgba: d.rgba,
        srcWidth: d.width,
        crop: {
          x: packInput.cropX,
          y: packInput.cropY,
          w: packInput.cropW,
          h: packInput.cropH,
        },
        dstX: region.frame.x,
        dstY: region.frame.y,
      };
    });

    options.onProgress?.({
      current: pi + 1,
      total: pages.length,
      label: `Composing page ${pi + 1}...`,
    });
    const blob = await composePageBlob(
      page.width,
      page.height,
      regionSources,
      signal,
    );
    artifacts.push({
      fileName: pageFileNames[pi]!,
      mimeType: "image/png",
      blob,
      relativePath: `${safeRoot}/${pageFileNames[pi]}`,
    });
  }

  if (signal?.aborted) return cancelled();

  const atlasFileName = `${safeRoot}.atlas.json`;
  const atlasJson = isMulti
    ? buildMultiAtlasJson(pages, pageFileNames, String(scale / 100))
    : buildSingleAtlasJson(pages[0]!, pageFileNames[0]!, String(scale / 100));
  artifacts.push({
    fileName: atlasFileName,
    mimeType: "application/json",
    blob: new Blob([JSON.stringify(atlasJson)], { type: "application/json" }),
    relativePath: `${safeRoot}/${atlasFileName}`,
  });

  if (signal?.aborted) return cancelled();

  const animInputs: AnimationInput[] = [];
  const animationNameCounts = new Map<string, number>();
  for (const animation of options.animations) {
    animationNameCounts.set(
      animation.name,
      (animationNameCounts.get(animation.name) ?? 0) + 1,
    );
  }
  const frameNamesByAnim = new Map<string, string[]>();
  for (const f of frames) {
    const existing = frameNamesByAnim.get(f.animId) ?? [];
    existing.push(f.identity);
    frameNamesByAnim.set(f.animId, existing);
  }

  for (const animation of options.animations) {
    const names = frameNamesByAnim.get(animation.id) ?? [];
    const animFps = animation.fps ?? fps;
    const animationKey =
      animationNameCounts.get(animation.name) === 1
        ? `${textureKey}:${animation.name}`
        : `${textureKey}:${animation.name}-${sanitizeName(animation.id)}`;
    animInputs.push({
      animId: animation.id,
      animName: animation.name,
      animationKey,
      textureKey,
      frameNames: names,
      fps: animFps,
      repeat,
      markers: animation.markers ?? [],
    });
  }

  const animsFileName = `${safeRoot}.animations.json`;
  const animJson = buildAnimationJson(animInputs);
  artifacts.push({
    fileName: animsFileName,
    mimeType: "application/json",
    blob: new Blob([JSON.stringify(animJson)], { type: "application/json" }),
    relativePath: `${safeRoot}/${animsFileName}`,
  });

  if (signal?.aborted) return cancelled();

  const markersFileName = `${safeRoot}.markers.json`;
  const markersJson = buildMarkerManifest(animInputs);
  artifacts.push({
    fileName: markersFileName,
    mimeType: "application/json",
    blob: new Blob([JSON.stringify(markersJson)], { type: "application/json" }),
    relativePath: `${safeRoot}/${markersFileName}`,
  });

  const reportFileName = `${safeRoot}.export-report.json`;
  const report = buildExportReport({
    fps,
    scale,
    trim,
    padding,
    maxPageSize,
    loop,
    repeat,
    destination: options.destination,
    pageCount: pages.length,
    totalFrames: frames.length,
    animationCount: options.animations.length,
    markerCount: markersJson.markers.length,
    issues: options.bakeIssues ?? [],
  });
  artifacts.push({
    fileName: reportFileName,
    mimeType: "application/json",
    blob: new Blob([JSON.stringify(report)], { type: "application/json" }),
    relativePath: `${safeRoot}/${reportFileName}`,
  });

  const exampleFileName = `${safeRoot}.example.ts`;
  const exampleTs = buildExampleTs({
    textureKey,
    atlasFileNames: pageFileNames,
    atlasJsonFileName: atlasFileName,
    animationsJsonFileName: animsFileName,
    animationKeys: animInputs.map((a) => a.animationKey),
    isMulti,
    rootFolder: safeRoot,
  });
  artifacts.push({
    fileName: exampleFileName,
    mimeType: "text/typescript",
    blob: new Blob([exampleTs], { type: "text/typescript" }),
    relativePath: `${safeRoot}/${exampleFileName}`,
  });

  const readmeFileName = "README.md";
  const readme = buildReadme({
    textureKey,
    animationKeys: animInputs.map((a) => a.animationKey),
    isMulti,
    pageCount: pages.length,
    markerCount: markersJson.markers.length,
    pageFileNames,
  });
  artifacts.push({
    fileName: readmeFileName,
    mimeType: "text/markdown",
    blob: new Blob([readme], { type: "text/markdown" }),
    relativePath: `${safeRoot}/${readmeFileName}`,
  });

  const validation = validateArtifacts(artifacts, pages);
  if (validation) {
    return {
      ok: false,
      code: "PHASER_ATLAS_ARTIFACT_INVALID",
      message: validation,
    };
  }

  return { ok: true, artifacts };
}

function validateArtifacts(
  artifacts: ExportArtifact[],
  pages: readonly PackedPage[],
): string | null {
  const paths = new Set<string>();
  for (const a of artifacts) {
    const p = a.relativePath ?? a.fileName;
    if (paths.has(p)) return `Duplicate path: ${p}`;
    paths.add(p);
  }

  const pagePngs = artifacts.filter((a) => a.mimeType === "image/png");
  if (pagePngs.length !== pages.length) {
    return `Expected ${pages.length} page PNGs, found ${pagePngs.length}`;
  }

  const atlasJsons = artifacts.filter((a) =>
    a.fileName.endsWith(".atlas.json"),
  );
  if (atlasJsons.length !== 1)
    return `Expected 1 atlas JSON, found ${atlasJsons.length}`;

  const animJsons = artifacts.filter((a) =>
    a.fileName.endsWith(".animations.json"),
  );
  if (animJsons.length !== 1)
    return `Expected 1 animations JSON, found ${animJsons.length}`;

  const markerJsons = artifacts.filter((a) =>
    a.fileName.endsWith(".markers.json"),
  );
  if (markerJsons.length !== 1)
    return `Expected 1 markers JSON, found ${markerJsons.length}`;

  const reportJsons = artifacts.filter((a) =>
    a.fileName.endsWith(".export-report.json"),
  );
  if (reportJsons.length !== 1)
    return `Expected 1 export report, found ${reportJsons.length}`;

  const examples = artifacts.filter((a) => a.fileName.endsWith(".example.ts"));
  if (examples.length !== 1)
    return `Expected 1 example TS, found ${examples.length}`;

  const readmes = artifacts.filter((a) => a.fileName === "README.md");
  if (readmes.length !== 1) return `Expected 1 README, found ${readmes.length}`;

  return null;
}

function cancelled(): EncodeResult {
  return {
    ok: false,
    code: "PHASER_ATLAS_CANCELLED",
    message: "Export cancelled",
  };
}

function sanitizeName(name: string): string {
  return (
    (name || "export")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "export"
  );
}
