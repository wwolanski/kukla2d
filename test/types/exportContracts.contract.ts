import type {
  RasterExportVariantId,
  ExportPipelineId,
  ExportVariantDefinition,
  RasterExportPlan,
  ExportAreaContract,
  CapturedRasterFrame,
  ExportArtifact,
  PhaserAtlasVariantId,
  PhaserAtlasExportPlan,
  PhaserAtlasSourceFrame,
  PhaserAtlasLayout,
} from "../../packages/contracts/src/io.types.js";

const _rasterIds: RasterExportVariantId[] = [
  "png_sequence",
  "png_spritesheet",
  "gif",
];
void _rasterIds;

const _pipelineId: ExportPipelineId = "raster";
void _pipelineId;

const _activeDef: ExportVariantDefinition = {
  id: "png_sequence",
  label: "PNG Sequence",
  status: "active",
  pipeline: "raster",
};
void _activeDef;

const _unactiveDef: ExportVariantDefinition = {
  id: "live2d",
  label: "Live2D Runtime",
  status: "unactive",
  pipeline: null,
};
void _unactiveDef;

const _area: ExportAreaContract = {
  source: { x: 0, y: 0, width: 800, height: 600 },
  outputWidth: 800,
  outputHeight: 600,
};
void _area;

const _plan: RasterExportPlan = {
  variantId: "png_sequence",
  area: _area,
  fps: 24,
  animations: [{ id: "a1", name: "Idle", duration: 1000 }],
  frameSpecs: [{ animId: "a1", animName: "Idle", frameIndex: 0, timeMs: 0 }],
  background: { enabled: false, color: "#ffffff" },
  spriteSheet: null,
};
void _plan;

const _frame: CapturedRasterFrame = {
  animationId: "a1",
  animationName: "Idle",
  frameIndex: 0,
  timeMs: 0,
  width: 800,
  height: 600,
  dataUrl: "data:image/png;base64,...",
};
void _frame;

const _artifact: ExportArtifact = {
  fileName: "output.png",
  mimeType: "image/png",
  blob: new Blob(),
};
void _artifact;

// RasterExportPlan.variantId must be RasterExportVariantId
const _planGif: RasterExportPlan = { ..._plan, variantId: "gif" };
const _planSheet: RasterExportPlan = {
  ..._plan,
  variantId: "png_spritesheet",
  spriteSheet: { columns: 4 },
};
void _planGif;
void _planSheet;

// Non-raster IDs must NOT assign to RasterExportVariantId
// @ts-expect-error live2d is intentionally outside the raster boundary
const _badId: RasterExportVariantId = "live2d";
void _badId;

// Phaser atlas types
const _phaserVariantId: PhaserAtlasVariantId = "phaser_atlas";
void _phaserVariantId;

const _phaserPipeline: ExportPipelineId = "phaser_atlas";
void _phaserPipeline;

const _phaserDef: ExportVariantDefinition = {
  id: "phaser_atlas",
  label: "Phaser 4.2.1 — Texture Atlas (Baked)",
  status: "unactive",
  pipeline: null,
};
void _phaserDef;

const _phaserPlan: PhaserAtlasExportPlan = {
  variantId: "phaser_atlas",
  area: _area,
  fps: 24,
  scale: 100,
  animations: [{ id: "a1", name: "Idle", duration: 1000 }],
  frameSpecs: [{ animId: "a1", animName: "Idle", frameIndex: 0, timeMs: 0 }],
  background: { enabled: false, color: "#ffffff" },
  trim: true,
  padding: 2,
  maxPageSize: 2048,
  loop: true,
  outputName: "character",
  destination: "zip",
};
void _phaserPlan;

const _phaserFrame: PhaserAtlasSourceFrame = {
  identity: "Idle-a1/0000",
  animName: "Idle",
  animId: "a1",
  frameIndex: 0,
  dataUrl: "data:image/png;base64,...",
  sourceWidth: 800,
  sourceHeight: 600,
  trimRect: { x: 10, y: 10, w: 780, h: 580 },
  packedPage: 0,
  packedX: 0,
  packedY: 0,
  pivotOffsetX: 0,
  pivotOffsetY: 0,
};
void _phaserFrame;

const _phaserLayout: PhaserAtlasLayout = {
  pages: [
    {
      width: 2048,
      height: 2048,
      regions: [
        {
          name: "Idle-a1/0000",
          frame: { x: 0, y: 0, w: 780, h: 580 },
          rotated: false,
          trimmed: true,
          spriteSourceSize: { x: 10, y: 10, w: 780, h: 580 },
          sourceSize: { w: 800, h: 600 },
        },
      ],
    },
  ],
};
void _phaserLayout;

// phaser_atlas must NOT assign to RasterExportVariantId
// @ts-expect-error phaser_atlas is intentionally outside the raster boundary
const _badRasterId: RasterExportVariantId = "phaser_atlas";
void _badRasterId;
