/** Canonical persistent project document contract shared by all packages. */
import type { NodeId, BoneId, AssetId, AnimationId, AnimationTargetId, SlotId, AttachmentId, SkinId, ConstraintId, ModularSpriteId } from './errors.js';

export type { AnimationTargetId } from './errors.js';

export interface Transform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  pivotX: number;
  pivotY: number;
}

export interface BoneSetup {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  shearX: number;
  shearY: number;
  length: number;
}

export interface Vertex {
  x: number;
  y: number;
  restX?: number;
  restY?: number;
}

export interface VertexInfluence {
  boneId: BoneId;
  weight: number;
}

export interface Mesh {
  vertices: Vertex[];
  uvs: number[] | Float32Array;
  triangles: [number, number, number][];
  edgeIndices: number[];
  boneWeights?: number[];
  jointBoneId?: string | null;
  influences?: VertexInfluence[][];
}

export interface BlendShape {
  id: string;
  name: string;
  deltas: { dx: number; dy: number }[];
}

export interface BaseNode {
  id: NodeId;
  name: string;
  parent: NodeId | null;
  transform: Transform;
  opacity: number;
  visible: boolean;
  pivotLocked?: boolean;
}

export interface PartNode extends BaseNode {
  type: 'part';
  draw_order: number;
  clip_mask?: string | null;
  clipToPartId?: NodeId;
  meshOpts?: unknown;
  mesh?: Mesh | null;
  blendShapes?: BlendShape[];
  blendShapeValues?: Record<string, number>;
  boneId?: BoneId | null;
  meshInfluenceBoneIds?: BoneId[];
  boneLinkLocked?: boolean;
  imageWidth?: number;
  imageHeight?: number;
  imageBounds?: { minX: number; minY: number; maxX: number; maxY: number };
  alphaContours?: [number, number][][];
  textureId?: string;
  tag?: string;
}

export interface GroupNode extends BaseNode {
  type: 'group';
  boneRole?: string | null;
}

export interface WarpDeformerNode extends BaseNode {
  type: 'warpDeformer';
  col?: number;
  row?: number;
  gridX?: number;
  gridY?: number;
  gridW?: number;
  gridH?: number;
}

export type Node = PartNode | GroupNode | WarpDeformerNode;

export interface Bone {
  id: BoneId;
  name: string;
  parentId: BoneId | null;
  setup: BoneSetup;
  inherit?: 'normal' | 'onlyTranslation' | 'noRotationOrReflection' | 'noScale' | 'noScaleOrReflection';
  nodeId?: NodeId | null;
}

export interface Constraint {
  id: ConstraintId;
  type: 'ik';
  name: string;
  order: number;
  enabled?: boolean;
  affectedBoneIds: BoneId[];
  assignedBoneId?: BoneId | null;
  targetBoneId?: BoneId | null;
  targetX?: number;
  targetY?: number;
  color?: number;
  poleBoneId?: BoneId | null;
  mix?: number;
  fkIk?: number;
  bendPositive?: boolean;
}

export interface Slot {
  id: SlotId;
  name: string;
  boneId: BoneId;
  setupAttachmentId?: AttachmentId | null;
  color?: string;
  blendMode?: 'normal' | 'additive' | 'multiply' | 'screen';
  drawOrder?: number;
}

export interface Attachment {
  id: AttachmentId;
  type: 'region' | 'mesh';
  assetId?: string | null;
  localTransform?: Transform;
  geometry?: unknown;
}

export interface SkinEntry {
  slotId: SlotId;
  attachmentId: AttachmentId;
}

export interface Skin {
  id: SkinId;
  name: string;
  entries: SkinEntry[];
}

export interface Texture {
  id: AssetId;
  source: string;
  name?: string;
  fileName?: string;
  fileSize?: number | null;
}

export interface KeyframeAuthoringMeta {
  gestureId: string;
  role: 'authored' | 'derived' | 'support';
  source: string;
}

export interface Keyframe {
  time: number;
  value: unknown;
  easing?: string | [number, number, number, number];
  authoring?: KeyframeAuthoringMeta;
}

export interface Marker {
  id: string;
  time: number;
  label: string;
}

export interface Track {
  targetId: AnimationTargetId;
  property: string;
  keyframes: Keyframe[];
}

export interface AudioTrack {
  id: string;
  name?: string;
  source?: string | null;
  sourceUrl?: string | null;
  mimeType?: string | null;
  audioDurationMs?: number;
  audioStartMs?: number;
  audioEndMs?: number | null;
  timelineStartMs?: number;
}

export interface BoomerangTargetMeta {
  sourceEndMs: number;
}

export interface Animation {
  id: AnimationId;
  name: string;
  duration: number;
  fps: number;
  tracks: Track[];
  markers?: Marker[];
  audioTracks?: AudioTrack[];
  boomerangTargets?: Record<string, BoomerangTargetMeta>;
}

export interface LibraryFolder {
  id: string;
  name: string;
  parentId?: string | null;
  sourceFileName?: string;
  origin?: 'import' | 'user';
}

export interface AssetPlacement {
  assetId: string;
  folderId?: string | null;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface NormalizedRect extends NormalizedPoint {
  width: number;
  height: number;
}

export type ModularSpriteSide = 'left' | 'right' | 'center' | 'none';
export type ModularSpriteMaskStrokeKind = 'foreground' | 'background' | 'split';

export interface ModularSpriteMaskStroke {
  kind: ModularSpriteMaskStrokeKind;
  radius: number;
  points: NormalizedPoint[];
}

export interface ModularSpriteProcessingRecipe {
  background: {
    mode: 'alpha' | 'chroma';
    color: { r: number; g: number; b: number };
    tolerance: number;
    softness: number;
    despill: number;
  };
  detection: {
    alphaThreshold: number;
    minimumRegionAreaRatio: number;
    openingRadius: number;
    closingRadius: number;
    connectivity: 8;
  };
  strokes: ModularSpriteMaskStroke[];
}

export interface ModularSpritePart {
  partKey: string;
  assetId: AssetId;
  name: string;
  role: string;
  semanticRoleId?: string;
  qualifiers?: Record<string, string>;
  side: ModularSpriteSide;
  required: boolean;
  order: number;
  extractionFrame: NormalizedRect;
  contentBounds: NormalizedRect;
  componentSeeds: NormalizedPoint[];
}

export interface ModularSpriteDocument {
  id: ModularSpriteId;
  schemaVersion: 1;
  name: string;
  sourceAssetId: AssetId;
  source: { width: number; height: number };
  processorVersion: 1;
  recipe: ModularSpriteProcessingRecipe;
  parts: ModularSpritePart[];
  schemaBinding?: {
    schemaId: string;
    schemaRevision: number;
    compositionId: string;
    slotToPartKey: Record<string, string>;
    snapshot: {
      formatVersion: 1;
      schemaId: string;
      revision: number;
      compositionId: string;
      name: string;
      slots: unknown[];
    };
  };
}

export interface ControlHandle {
  id: string;
  name: string;
  role: string;
  space: 'canvas' | 'node-local' | 'bone-local';
  target: {
    kind: 'project' | 'part' | 'bone' | 'warpDeformer';
    id: string;
  };
  position: { x: number; y: number };
  radius?: number;
  locked?: boolean;
  source?: string;
}

export interface TimeDriver {
  kind: 'time';
  periodMs: number;
  phase: number;
  curve: 'sine' | 'triangle' | 'easeInOutSine';
}

export interface BoneMotionDriver {
  kind: 'boneMotion';
  sourceBoneId?: string;
  axes: ('x' | 'y' | 'rotation')[];
  gain: number;
  deadZone?: number;
  curve?: 'linear' | 'abs';
}

export type ModifierDriver = TimeDriver | BoneMotionDriver;

export interface ModifierBinding {
  role: string;
  required: boolean;
  target: 'handle' | 'part' | 'bone' | 'warpDeformer';
  weight?: number;
  axis?: string;
  note?: string;
}

export type ModifierOutput = {
  kind: 'blendShapeValue' | 'nodeTransform' | 'boneTransform' | 'meshDelta' | 'warpGrid';
  targetId: string;
  property: string;
  blendMode?: 'add' | 'multiply' | 'replace';
};

export interface AnimationModifier {
  id: string;
  name: string;
  presetId: string;
  presetVersion: number;
  enabled: boolean;
  muted?: boolean;
  solo?: boolean;
  order: number;
  scope: 'project' | 'clip';
  clipId?: string;
  category: string;
  driver: ModifierDriver;
  bindings: Record<string, ModifierBinding>;
  outputs: ModifierOutput[];
  params: Record<string, number>;
  bake?: { clipped?: boolean } | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Extensible legacy physics rule persisted by CMO3-compatible projects. */
export interface PhysicsRule {
  id: string;
  name?: string;
  enabled?: boolean;
  [property: string]: unknown;
}

export interface Canvas {
  width: number;
  height: number;
  x: number;
  y: number;
  presetId?: 'custom' | 'square-256' | 'square-512' | 'square-1024' | 'pixel-16-9' | 'hd-720' | 'full-hd' | 'portrait-720' | 'classic-4-3';
  fitSource?:
    | { kind: 'animation'; animationId: string; animationName: string }
    | { kind: 'staging' }
    | null;
}

export interface ProjectDocument {
  version: number;
  author: string;
  lastActiveAnimationId: AnimationId | null;
  canvas: Canvas;
  textures: Texture[];
  nodes: Node[];
  bones: Bone[];
  slots: Slot[];
  attachments: Attachment[];
  skins: Skin[];
  constraints: Constraint[];
  defaultPose: Record<string, Record<string, number | boolean | { x: number; y: number }[]>>;
  animations: Animation[];
  physics_groups: unknown[];
  physicsRules: PhysicsRule[];
  libraryFolders: LibraryFolder[];
  assetPlacements: AssetPlacement[];
  modularSprites: ModularSpriteDocument[];
  controlHandles: ControlHandle[];
  animationModifiers: AnimationModifier[];
}
