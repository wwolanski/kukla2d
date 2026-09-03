import { z } from 'zod';

import {
  toAnimationId,
  toAnimationTargetId,
  toAttachmentId,
  toAssetId,
  toBoneId,
  toConstraintId,
  toNodeId,
  toModularSpriteId,
  toSkinId,
  toSlotId,
} from '@kukla2d/contracts';

import { isSupportedTrackProperty, validateTrackValue } from '@/domain/animationProperties.js';

import { CanvasSchema, NodeSchema, TransformSchema } from './projectNodeSchemas.js';

export const CURRENT_PROJECT_VERSION = 10 as const;

const AnimationIdSchema = z.string().min(1).transform(toAnimationId);
const AnimationTargetIdSchema = z.string().min(1).transform(toAnimationTargetId);
const AttachmentIdSchema = z.string().min(1).transform(toAttachmentId);
const AssetIdSchema = z.string().min(1).transform(toAssetId);
const BoneIdSchema = z.string().min(1).transform(toBoneId);
const ConstraintIdSchema = z.string().min(1).transform(toConstraintId);
const NodeIdSchema = z.string().min(1).transform(toNodeId);
const ModularSpriteIdSchema = z.string().min(1).transform(toModularSpriteId);
const SkinIdSchema = z.string().min(1).transform(toSkinId);
const SlotIdSchema = z.string().min(1).transform(toSlotId);

const BoneSetupSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.number().finite(),
  scaleX: z.number().finite(),
  scaleY: z.number().finite(),
  shearX: z.number().finite(),
  shearY: z.number().finite(),
  length: z.number().finite(),
});

const PoseOverrideValueSchema = z.union([
  z.number().finite(),
  z.boolean(),
  z.array(z.object({ x: z.number().finite(), y: z.number().finite() })),
]);
const PoseOverrideSchema = z.record(z.string(), PoseOverrideValueSchema);

const BoneSchema = z.object({
  id: BoneIdSchema,
  name: z.string(),
  parentId: BoneIdSchema.nullable(),
  setup: BoneSetupSchema,
  inherit: z.enum(['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection']).optional(),
  nodeId: NodeIdSchema.nullable().optional(),
});

const ConstraintSchema = z.object({
  id: ConstraintIdSchema,
  type: z.enum(['ik']),
  name: z.string(),
  order: z.number().finite(),
  enabled: z.boolean().optional(),
  affectedBoneIds: z.array(BoneIdSchema),
  assignedBoneId: BoneIdSchema.nullable().optional(),
  targetBoneId: BoneIdSchema.nullable().optional(),
  targetX: z.number().finite().optional(),
  targetY: z.number().finite().optional(),
  color: z.number().int().min(0).max(0xffffff).optional(),
  poleBoneId: BoneIdSchema.nullable().optional(),
  mix: z.number().finite().min(0).max(1).optional(),
  fkIk: z.number().finite().min(0).max(1).optional(),
  bendPositive: z.boolean().optional(),
});

const AttachmentSchema = z.object({
  id: AttachmentIdSchema,
  type: z.enum(['region', 'mesh']),
  assetId: AssetIdSchema.nullable().optional(),
  localTransform: TransformSchema.optional(),
  geometry: z.unknown().optional(),
});

const SlotSchema = z.object({
  id: SlotIdSchema,
  name: z.string(),
  boneId: BoneIdSchema,
  setupAttachmentId: AttachmentIdSchema.nullable().optional(),
  color: z.string().optional(),
  blendMode: z.enum(['normal', 'additive', 'multiply', 'screen']).optional(),
  drawOrder: z.number().optional(),
});

const SkinEntrySchema = z.object({
  slotId: SlotIdSchema,
  attachmentId: AttachmentIdSchema,
});

const SkinSchema = z.object({
  id: SkinIdSchema,
  name: z.string(),
  entries: z.array(SkinEntrySchema),
});

const KeyframeAuthoringMetaSchema = z.object({
  gestureId: z.string().min(1),
  role: z.enum(['authored', 'derived', 'support']),
  source: z.string().min(1),
});

const KeyframeSchema = z.object({
  time: z.number().finite().min(0),
  value: z.unknown(),
  easing: z.union([z.string(), z.array(z.number().finite()).length(4)]).optional(),
  authoring: KeyframeAuthoringMetaSchema.optional(),
});

const TrackSchema = z.object({
  targetId: AnimationTargetIdSchema,
  property: z.string().min(1),
  keyframes: z.array(KeyframeSchema),
}).superRefine((track, ctx) => {
  if (!isSupportedTrackProperty(track.property)) {
    ctx.addIssue({
      code: 'custom',
      message: `Unknown animation property "${track.property}"`,
      path: ['property'],
    });
    return;
  }

  const seenTimes = new Set<number>();
  let previousTime = -Infinity;

  track.keyframes.forEach((keyframe, index) => {
    if (!validateTrackValue(track.property, keyframe.value)) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid value for "${track.property}" track`,
        path: ['keyframes', index, 'value'],
      });
    }

    if (keyframe.time < previousTime) {
      ctx.addIssue({
        code: 'custom',
        message: 'Track keyframes must be sorted by time',
        path: ['keyframes', index, 'time'],
      });
    }

    if (seenTimes.has(keyframe.time)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Track keyframes must have unique time values',
        path: ['keyframes', index, 'time'],
      });
    }

    previousTime = keyframe.time;
    seenTimes.add(keyframe.time);
  });
});

const AudioTrackSchema = z.object({
  id: AnimationIdSchema,
  name: z.string().optional(),
  source: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  audioDurationMs: z.number().finite().min(0).optional(),
  audioStartMs: z.number().finite().min(0).optional(),
  audioEndMs: z.number().finite().min(0).nullable().optional(),
  timelineStartMs: z.number().finite().min(0).optional(),
});

const MarkerSchema = z.object({
  id: z.string().min(1),
  time: z.number().finite().min(0),
  label: z.string(),
});

const BoomerangTargetMetaSchema = z.object({
  sourceEndMs: z.number().finite().positive(),
});

const AnimationSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  duration: z.number().finite().min(0),
  fps: z.number().int().min(1).max(120),
  tracks: z.array(TrackSchema),
  markers: z.array(MarkerSchema).optional(),
  audioTracks: z.array(AudioTrackSchema).optional(),
  boomerangTargets: z.record(z.string(), BoomerangTargetMetaSchema).optional(),
}).superRefine((animation, ctx) => {
  const uniqueTrackKeys = new Set<string>();

  animation.tracks.forEach((track, index) => {
    const key = `${track.targetId}::${track.property}`;
    if (uniqueTrackKeys.has(key)) {
      ctx.addIssue({
        code: 'custom',
        message: `Animation track "${track.property}" must be unique per targetId`,
        path: ['tracks', index, 'targetId'],
      });
      return;
    }
    uniqueTrackKeys.add(key);
  });
});

const TextureSchema = z.object({
  id: z.string().min(1),
  source: z.string(),
  name: z.string().min(1).optional(),
  fileName: z.string().optional(),
  fileSize: z.number().nullable().optional(),
});

const LibraryFolderSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  parentId: z.string().nullable().optional(),
  sourceFileName: z.string().optional(),
  origin: z.enum(['import', 'user']).optional(),
});

const AssetPlacementSchema = z.object({
  assetId: z.string().min(1),
  folderId: z.string().nullable().optional(),
});

const NormalizedPointSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});

const NormalizedRectSchema = NormalizedPointSchema.extend({
  width: z.number().finite().positive().max(1),
  height: z.number().finite().positive().max(1),
}).refine(rect => rect.x + rect.width <= 1 + Number.EPSILON, {
  message: 'Normalized rectangle exceeds image width',
}).refine(rect => rect.y + rect.height <= 1 + Number.EPSILON, {
  message: 'Normalized rectangle exceeds image height',
});

const ModularSpriteRecipeSchema = z.object({
  background: z.object({
    mode: z.enum(['alpha', 'chroma']),
    color: z.object({
      r: z.number().int().min(0).max(255),
      g: z.number().int().min(0).max(255),
      b: z.number().int().min(0).max(255),
    }),
    tolerance: z.number().finite().min(0).max(1),
    softness: z.number().finite().min(0).max(1),
    despill: z.number().finite().min(0).max(1),
  }),
  detection: z.object({
    alphaThreshold: z.number().int().min(0).max(255),
    minimumRegionAreaRatio: z.number().finite().min(0).max(1),
    openingRadius: z.number().int().min(0).max(32),
    closingRadius: z.number().int().min(0).max(32),
    connectivity: z.literal(8),
  }),
  strokes: z.array(z.object({
    kind: z.enum(['foreground', 'background', 'split']),
    radius: z.number().finite().positive().max(1),
    points: z.array(NormalizedPointSchema).min(1),
  })),
});

const ModularSpritePartSchema = z.object({
  partKey: z.string().regex(/^[a-z][a-z0-9-]*$/),
  assetId: AssetIdSchema,
  name: z.string().min(1),
  role: z.string().min(1),
  side: z.enum(['left', 'right', 'center', 'none']),
  required: z.boolean(),
  order: z.number().int().nonnegative(),
  extractionFrame: NormalizedRectSchema,
  contentBounds: NormalizedRectSchema,
  componentSeeds: z.array(NormalizedPointSchema).min(1),
});

const ModularSpriteDocumentSchema = z.object({
  id: ModularSpriteIdSchema,
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  sourceAssetId: AssetIdSchema,
  source: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  processorVersion: z.literal(1),
  recipe: ModularSpriteRecipeSchema,
  parts: z.array(ModularSpritePartSchema),
});

const PhysicsGroupSchema = z.unknown();

const PhysicsRuleSchema = z.unknown();

const ControlHandleTargetSchema = z.object({
  kind: z.enum(['project', 'part', 'bone', 'warpDeformer']),
  id: z.string().min(1),
});

const ControlHandleSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  role: z.string().min(1),
  space: z.enum(['canvas', 'node-local', 'bone-local']),
  target: ControlHandleTargetSchema,
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  radius: z.number().finite().positive().optional(),
  locked: z.boolean().optional(),
  source: z.string().optional(),
});

const TimeDriverSchema = z.object({
  kind: z.literal('time'),
  periodMs: z.number().finite().positive(),
  phase: z.number().finite(),
  curve: z.enum(['sine', 'triangle', 'easeInOutSine']),
});

const BoneMotionDriverSchema = z.object({
  kind: z.literal('boneMotion'),
  sourceBoneId: z.string().min(1),
  axes: z.array(z.enum(['x', 'y', 'rotation'])),
  gain: z.number().finite().nonnegative(),
  deadZone: z.number().finite().nonnegative().optional(),
  curve: z.enum(['linear', 'abs']).optional(),
});

const ModifierDriverSchema = z.discriminatedUnion('kind', [TimeDriverSchema, BoneMotionDriverSchema]);

const ModifierBindingSchema = z.object({
  role: z.string().min(1),
  required: z.boolean(),
  target: z.enum(['handle', 'part', 'bone', 'warpDeformer']),
  weight: z.number().finite().min(0).max(1).optional(),
  axis: z.string().optional(),
  note: z.string().optional(),
});

const ModifierOutputSchema = z.object({
  kind: z.enum(['blendShapeValue', 'nodeTransform', 'boneTransform', 'meshDelta', 'warpGrid']),
  targetId: z.string().min(1),
  property: z.string().min(1),
  blendMode: z.enum(['add', 'multiply', 'replace']).optional(),
});

const AnimationModifierSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  presetId: z.string().min(1),
  presetVersion: z.number().int().min(1),
  enabled: z.boolean(),
  muted: z.boolean().optional(),
  solo: z.boolean().optional(),
  order: z.number().finite(),
  scope: z.enum(['project', 'clip']),
  clipId: z.string().min(1).optional(),
  category: z.string(),
  driver: ModifierDriverSchema,
  bindings: z.record(z.string(), ModifierBindingSchema),
  outputs: z.array(ModifierOutputSchema),
  params: z.record(z.string(), z.number().finite()),
  bake: z.object({ clipped: z.boolean().optional() }).nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const ProjectDocumentSchema = z.object({
  version: z.union([z.string(), z.number()]),
  author: z.string().default(''),
  lastActiveAnimationId: AnimationIdSchema.nullable().default(null),
  canvas: CanvasSchema,
  textures: z.array(TextureSchema),
  nodes: z.array(NodeSchema),
  bones: z.array(BoneSchema).optional(),
  slots: z.array(SlotSchema).optional(),
  attachments: z.array(AttachmentSchema).optional(),
  skins: z.array(SkinSchema).optional(),
  constraints: z.array(ConstraintSchema).optional(),
  defaultPose: z.record(z.string(), PoseOverrideSchema).optional(),
  animations: z.array(AnimationSchema),
  physics_groups: z.array(PhysicsGroupSchema).optional(),
  physicsRules: z.array(PhysicsRuleSchema).optional(),
  libraryFolders: z.array(LibraryFolderSchema).optional(),
  assetPlacements: z.array(AssetPlacementSchema).optional(),
  modularSprites: z.array(ModularSpriteDocumentSchema).default([]),
  controlHandles: z.array(ControlHandleSchema),
  animationModifiers: z.array(AnimationModifierSchema),
}).superRefine((project, ctx) => {
  const nodesById = new Map(project.nodes.map((node) => [node.id, node]));
  const textureIds = new Set(project.textures.map(texture => String(texture.id)));
  const modularSpriteIds = new Set<string>();
  const claimedAssetIds = new Set<string>();

  project.modularSprites.forEach((modularSprite, modularIndex) => {
    const modularSpriteId = String(modularSprite.id);
    if (modularSpriteIds.has(modularSpriteId)) {
      ctx.addIssue({ code: 'custom', message: `Duplicate modular sprite id "${modularSpriteId}"`, path: ['modularSprites', modularIndex, 'id'] });
    }
    modularSpriteIds.add(modularSpriteId);

    const localPartKeys = new Set<string>();
    const assetClaims = [String(modularSprite.sourceAssetId), ...modularSprite.parts.map(part => String(part.assetId))];
    assetClaims.forEach((assetId, assetIndex) => {
      const path = assetIndex === 0
        ? ['modularSprites', modularIndex, 'sourceAssetId']
        : ['modularSprites', modularIndex, 'parts', assetIndex - 1, 'assetId'];
      if (!textureIds.has(assetId)) {
        ctx.addIssue({ code: 'custom', message: `Modular sprite asset "${assetId}" does not match any texture`, path });
      }
      if (claimedAssetIds.has(assetId)) {
        ctx.addIssue({ code: 'custom', message: `Modular sprite asset "${assetId}" is claimed more than once`, path });
      }
      claimedAssetIds.add(assetId);
    });

    modularSprite.parts.forEach((part, partIndex) => {
      if (localPartKeys.has(part.partKey)) {
        ctx.addIssue({ code: 'custom', message: `Duplicate modular sprite partKey "${part.partKey}"`, path: ['modularSprites', modularIndex, 'parts', partIndex, 'partKey'] });
      }
      localPartKeys.add(part.partKey);
    });
  });

  project.nodes.forEach((node, index) => {
    if (node.type !== 'part' || node.clipToPartId === undefined) return;

    if (node.clipToPartId === node.id) {
      ctx.addIssue({
        code: 'custom',
        message: `clipToPartId "${node.clipToPartId}" cannot reference source node "${node.id}"`,
        path: ['nodes', index, 'clipToPartId'],
      });
      return;
    }

    const target = nodesById.get(node.clipToPartId);
    if (!target) {
      ctx.addIssue({
        code: 'custom',
        message: `clipToPartId "${node.clipToPartId}" does not match any node`,
        path: ['nodes', index, 'clipToPartId'],
      });
      return;
    }

    if (target.type !== 'part') {
      ctx.addIssue({
        code: 'custom',
        message: `clipToPartId "${node.clipToPartId}" must reference a part node`,
        path: ['nodes', index, 'clipToPartId'],
      });
    }
  });
});

export type ProjectDocumentInput = z.input<typeof ProjectDocumentSchema>;
export type ValidatedProjectDocument = z.output<typeof ProjectDocumentSchema>;

export function validateProject(data: unknown): z.ZodSafeParseResult<ValidatedProjectDocument> {
  return ProjectDocumentSchema.safeParse(data);
}

export function parseProject(data: unknown): ValidatedProjectDocument {
  return ProjectDocumentSchema.parse(data);
}
