/**
 * Shared types for the versioned migration chain (0.1 -> 10).
 *
 * Migration inputs are untrusted JSON-derived records. The migration layer
 * works on a legacy document shape that intentionally stays narrower than the
 * validated `ProjectDocument` (K3) boundary: migration data must never be cast
 * to K3, it remains a migration document until Zod is applied by the caller.
 *
 * Per-stage constraints (see `.plans/2-typescript-schema-foundation/stages/03-lancuch-migracji.md`):
 * - no `any`, no `as ProjectDocument`, no blanket suppressions;
 * - typed structural fields only for surfaces touched by a given step;
 * - index signature kept as `unknown` (never `any`) to force narrowing before use.
 *
 * Optional fields are explicitly typed `T | undefined` because tsconfig enables
 * `exactOptionalPropertyTypes`: passing `undefined` to a `?`-only field is
 * otherwise rejected, and historical records frequently omit these fields.
 */

export type MigrationFromKey =
  | '0.1'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9';

interface MigrationTransform {
  x?: number | undefined;
  y?: number | undefined;
  rotation?: number | undefined;
  scaleX?: number | undefined;
  scaleY?: number | undefined;
  pivotX?: number | undefined;
  pivotY?: number | undefined;
  [key: string]: unknown;
}

interface MigrationBoneSetup {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  shearX: number;
  shearY: number;
  length: number;
}

interface MigrationBone {
  id: string;
  name?: string | undefined;
  parentId?: string | null | undefined;
  setup: MigrationBoneSetup;
  inherit?: string | undefined;
  [key: string]: unknown;
}

interface MigrationMesh {
  vertices?: number[] | undefined;
  triangles?: number[][] | undefined;
  uvs?: number[] | undefined;
  jointBoneId?: string | null | undefined;
  boneWeights?: number | undefined;
  influences?: unknown;
  [key: string]: unknown;
}

export interface MigrationNode {
  id: string;
  type?: string | undefined;
  name?: string | undefined;
  parent?: string | null | undefined;
  draw_order?: number | undefined;
  opacity?: number | undefined;
  visible?: boolean | undefined;
  transform?: MigrationTransform;
  blendShapes?: unknown[];
  blendShapeValues?: Record<string, unknown>;
  col?: number | undefined;
  row?: number | undefined;
  gridW?: number | undefined;
  gridH?: number | undefined;
  gridX?: number | undefined;
  gridY?: number | undefined;
  parameterId?: unknown;
  mesh?: MigrationMesh;
  clipToPartId?: string | undefined;
  [key: string]: unknown;
}

export interface MigrationTrack {
  nodeId?: string | null | undefined;
  targetId?: string | null | undefined;
  property?: string | undefined;
  keyframes?: unknown[];
  [key: string]: unknown;
}

interface MigrationAnimation {
  id: string;
  name?: string | undefined;
  duration?: number | undefined;
  fps?: number | undefined;
  tracks?: MigrationTrack[];
  audioTracks?: unknown[];
  [key: string]: unknown;
}

interface MigrationSlot {
  id: string;
  name?: string | undefined;
  boneId?: string | null | undefined;
  setupAttachmentId?: string | undefined;
  color?: string | undefined;
  blendMode?: string | undefined;
  drawOrder?: number | undefined;
  [key: string]: unknown;
}

interface MigrationCanvas {
  width?: number | undefined;
  height?: number | undefined;
  x?: number | undefined;
  y?: number | undefined;
  presetId?: string | undefined;
  bgEnabled?: unknown;
  bgColor?: unknown;
  fitSource?: unknown;
  [key: string]: unknown;
}

interface MigrationAttachment {
  id: string;
  type?: string | undefined;
  assetId?: string | undefined;
  localTransform?: MigrationTransform | undefined;
  geometry?: unknown;
  [key: string]: unknown;
}

export interface MigrationSkinEntry {
  slotId: string;
  attachmentId: string;
  [key: string]: unknown;
}

export interface MigrationSkin {
  id: string;
  name?: string | undefined;
  entries: MigrationSkinEntry[];
  [key: string]: unknown;
}

/**
 * K4: record with unknown fields and a recognized `version`; only for the legacy chain.
 * Specific optional fields are typed only where a migration step reads/writes them.
 */
export interface MigrationDocument {
  version: number | string;
  author?: string;
  lastActiveAnimationId?: string | null;
  canvas?: MigrationCanvas;
  textures?: unknown[];
  nodes?: MigrationNode[];
  animations?: MigrationAnimation[];
  physics_groups?: unknown[];
  physicsRules?: unknown[];
  bones?: MigrationBone[];
  slots?: MigrationSlot[];
  attachments?: MigrationAttachment[];
  skins?: MigrationSkin[];
  libraryFolders?: unknown[];
  assetPlacements?: unknown[];
  controlHandles?: unknown[];
  animationModifiers?: unknown[];
  modularSprites?: unknown[];
  parameters?: unknown;
  [key: string]: unknown;
}

/**
 * K5: funkcja kroku z literalnymi wersjami. Registry type guarantees an
 * exhaustive key set 0.1..9 (version 10 ends the loop; it has no migrator).
 */
type MigrationStepFn = (project: MigrationDocument) => MigrationDocument;

export type MigrationRegistry = Record<MigrationFromKey, MigrationStepFn>;

/**
 * Guard R1: verify record and version first, then access fields. Inputs are
 * `unknown` JSON records until verified.
 */
export function isMigrationRecord(value: unknown): value is MigrationDocument {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  if (!('version' in value)) {
    return false;
  }
  const version = value.version;
  return typeof version === 'number' || typeof version === 'string';
}

/**
 * Read a version-like value from any untrusted input, without throwing on
 * access. Used to preserve the historical error message shape when a record
 * or version is missing.
 */
export function readRawVersion(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  if ('version' in value) {
    return value.version;
  }
  return undefined;
}
