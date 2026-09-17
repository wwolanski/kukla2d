export { scanAlphaBounds } from "./domain/phaserAtlasTrim.js";
export type { TrimResult } from "./domain/phaserAtlasTrim.types.js";

export {
  packAtlasFrames,
  validatePackLayout,
} from "./domain/phaserAtlasPacker.js";
export type {
  PackInput,
  PackResult,
  PackError,
  PackedRegion,
  PackedPage,
} from "./domain/phaserAtlasPacker.types.js";

export { encodePhaserAtlasPackage } from "./encodePhaserAtlasPackage.js";
export type {
  CapturedFrame,
  PackageOptions,
  ExportArtifact,
  EncodeResult,
} from "./encodePhaserAtlasPackage.types.js";

export {
  decodePngDataUrl,
  composePageBlob,
  AbortError,
} from "./browserImage.js";
export type { DecodedPng, PageComposeSource } from "./browserImage.types.js";

export {
  buildSingleAtlasJson,
  buildMultiAtlasJson,
} from "./phaserAtlasJson.js";
export type {
  SingleAtlasJson,
  MultiAtlasJson,
  AtlasJsonRegion,
  MultiAtlasPageEntry,
} from "./phaserAtlasJson.types.js";

export {
  buildAnimationJson,
  buildMarkerManifest,
} from "./phaserAnimationJson.js";
export type {
  AnimationJson,
  AnimationJsonEntry,
  AnimationJsonFrame,
  AnimationInput,
  MarkerEntry,
  MarkerManifest,
} from "./phaserAnimationJson.types.js";

export {
  buildExportReport,
  buildExampleTs,
  buildReadme,
} from "./phaserPackageDocs.js";
export type {
  BakeReport,
  BakeReportEntry,
  BakeReportInput,
  ExampleInput,
  ReadmeInput,
} from "./phaserPackageDocs.types.js";
