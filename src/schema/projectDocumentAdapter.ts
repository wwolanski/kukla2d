import type { ProjectDocument, Canvas } from '@kukla2d/contracts';

import { createEmptyProject } from '@/core/createEmptyProject';

import { normalizeAnimations } from '@/domain/animationDocument.js';

import type { ValidatedProjectDocument } from './projectSchema.js';

type PersistedProjectFields = Pick<
  ProjectDocument,
  (typeof PERSISTED_PROJECT_FIELDS)[number]
>;
type LegacyCanvas = Canvas & { bgEnabled?: unknown; bgColor?: unknown };
type LegacyNode = ProjectDocument['nodes'][number] & { parameterId?: unknown };

const LEGACY_CANVAS_PRESETS = Object.freeze([
  ['square-256', 256, 256] as const,
  ['square-512', 512, 512] as const,
  ['square-1024', 1024, 1024] as const,
  ['pixel-16-9', 640, 360] as const,
  ['hd-720', 1280, 720] as const,
  ['full-hd', 1920, 1080] as const,
  ['portrait-720', 720, 1280] as const,
  ['classic-4-3', 800, 600] as const,
]);

function inferLegacyCanvasPresetId(canvas: { width: number; height: number }): string {
  return LEGACY_CANVAS_PRESETS.find(([, width, height]) => (
    canvas.width === width && canvas.height === height
  ))?.[0] ?? 'custom';
}

export const PERSISTED_PROJECT_FIELDS = Object.freeze([
  'version',
  'author',
  'lastActiveAnimationId',
  'canvas',
  'textures',
  'nodes',
  'bones',
  'slots',
  'attachments',
  'skins',
  'constraints',
  'defaultPose',
  'animations',
  'physics_groups',
  'physicsRules',
  'libraryFolders',
  'assetPlacements',
  'modularSprites',
  'controlHandles',
  'animationModifiers',
] as const satisfies readonly (keyof ProjectDocument)[]);

function deepClone(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Float32Array) return new Float32Array(value);
  if (value instanceof Uint16Array) return new Uint16Array(value);
  if (value instanceof Uint32Array) return new Uint32Array(value);
  if (Array.isArray(value)) return value.map(deepClone);
  const cloned: Record<string, unknown> = {};
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      cloned[key] = deepClone((value as Record<string, unknown>)[key]);
    }
  }
  return cloned;
}

export function pickPersistedProjectFields(project: ProjectDocument): PersistedProjectFields;
export function pickPersistedProjectFields(project: unknown): PersistedProjectFields {
  const picked: Record<string, unknown> = {};
  const src = project as Record<string, unknown> | null | undefined;

  for (const field of PERSISTED_PROJECT_FIELDS) {
    picked[field] = src?.[field];
  }
  const clonedCanvas = deepClone(src?.canvas ?? {}) as LegacyCanvas;
  delete clonedCanvas.bgEnabled;
  delete clonedCanvas.bgColor;
  picked.canvas = clonedCanvas;

  // Dynamic key projection is constrained by PERSISTED_PROJECT_FIELDS above.
  return picked as PersistedProjectFields;
}

export function prepareLoadedProjectDocument(
  projectData: ValidatedProjectDocument | ProjectDocument,
): ProjectDocument {
  const defaults = createEmptyProject();
  const incoming = projectData ?? {};
  const project = createEmptyProject();

  const numericVersion = Number(incoming.version ?? defaults.version);
  project.version = Number.isFinite(numericVersion) ? numericVersion : defaults.version;
  project.author = typeof incoming.author === 'string' ? incoming.author : defaults.author;
  project.lastActiveAnimationId = incoming.lastActiveAnimationId ?? defaults.lastActiveAnimationId;
  const legacyCanvas: LegacyCanvas = {
    ...defaults.canvas,
    ...(deepClone(incoming.canvas ?? {}) as LegacyCanvas),
  };
  delete legacyCanvas.bgEnabled;
  delete legacyCanvas.bgColor;
  project.canvas = legacyCanvas;
  if (!Object.prototype.hasOwnProperty.call(incoming.canvas ?? {}, 'presetId')) {
    project.canvas.presetId = inferLegacyCanvasPresetId(project.canvas) as Exclude<Canvas['presetId'], undefined>;
  }
  project.textures = deepClone(incoming.textures ?? defaults.textures) as typeof defaults.textures;
  project.bones = deepClone(incoming.bones ?? defaults.bones) as typeof defaults.bones;
  project.slots = deepClone(incoming.slots ?? defaults.slots) as typeof defaults.slots;
  project.attachments = deepClone(incoming.attachments ?? defaults.attachments) as typeof defaults.attachments;
  project.skins = deepClone(incoming.skins ?? defaults.skins) as typeof defaults.skins;
  project.constraints = deepClone(incoming.constraints ?? defaults.constraints) as typeof defaults.constraints;
  project.defaultPose = deepClone(incoming.defaultPose ?? defaults.defaultPose) as typeof defaults.defaultPose;
  const nodes = deepClone(incoming.nodes ?? defaults.nodes) as Array<
    LegacyNode & {
      blendShapes?: unknown[];
      blendShapeValues?: Record<string, unknown>;
    }
  >;
  for (const node of nodes) {
    // Legacy runtime exposed these collections on every node kind.
    if (node.blendShapes === undefined) node.blendShapes = [];
    if (node.blendShapeValues === undefined) node.blendShapeValues = {};
    if (node.type === 'warpDeformer') {
      if (node.col === undefined) node.col = 2;
      if (node.row === undefined) node.row = 2;
      if (node.gridW === undefined) node.gridW = 200;
      if (node.gridH === undefined) node.gridH = 200;
      if (node.gridX === undefined) node.gridX = 0;
      if (node.gridY === undefined) node.gridY = 0;
      delete node.parameterId;
    }
  }
  project.nodes = nodes;
  project.animations = normalizeAnimations(deepClone(incoming.animations ?? defaults.animations));

  project.physics_groups = deepClone(incoming.physics_groups ?? defaults.physics_groups) as typeof defaults.physics_groups;
  project.physicsRules = deepClone(incoming.physicsRules ?? defaults.physicsRules) as typeof defaults.physicsRules;
  project.libraryFolders = deepClone(incoming.libraryFolders ?? defaults.libraryFolders) as typeof defaults.libraryFolders;
  project.assetPlacements = deepClone(incoming.assetPlacements ?? defaults.assetPlacements) as typeof defaults.assetPlacements;
  project.modularSprites = deepClone(incoming.modularSprites ?? defaults.modularSprites) as typeof defaults.modularSprites;
  project.controlHandles = deepClone(incoming.controlHandles ?? defaults.controlHandles) as typeof defaults.controlHandles;
  const modifiers = deepClone(incoming.animationModifiers ?? defaults.animationModifiers) as typeof defaults.animationModifiers;
  for (const mod of modifiers) {
    if (mod.bindings === undefined) mod.bindings = {};
    if (mod.outputs === undefined) mod.outputs = [];
    if (mod.params === undefined) mod.params = {};
  }
  project.animationModifiers = modifiers;

  return project;
}
