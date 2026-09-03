export type NodeId = string & { readonly __brand: 'NodeId' };
export type BoneId = string & { readonly __brand: 'BoneId' };
export type AssetId = string & { readonly __brand: 'AssetId' };
export type AnimationId = string & { readonly __brand: 'AnimationId' };
export type SlotId = string & { readonly __brand: 'SlotId' };
export type AttachmentId = string & { readonly __brand: 'AttachmentId' };
export type SkinId = string & { readonly __brand: 'SkinId' };
export type TrackId = string & { readonly __brand: 'TrackId' };
export type KeyframeId = string & { readonly __brand: 'KeyframeId' };
export type ConstraintId = string & { readonly __brand: 'ConstraintId' };
export type EventDefId = string & { readonly __brand: 'EventDefId' };
export type ModularSpriteId = string & { readonly __brand: 'ModularSpriteId' };
export type AnimationTargetId = NodeId | BoneId | SlotId | ConstraintId;

function toBrandedId<T extends string>(value: string, label: string): T {
  if (value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value as T;
}

/** Creates a NodeId after the input has crossed a validation or creation boundary. */
export function toNodeId(value: string): NodeId { return toBrandedId<NodeId>(value, 'NodeId'); }
/** Creates a BoneId after the input has crossed a validation or creation boundary. */
export function toBoneId(value: string): BoneId { return toBrandedId<BoneId>(value, 'BoneId'); }
/** Creates an AnimationId after the input has crossed a validation or creation boundary. */
export function toAnimationId(value: string): AnimationId { return toBrandedId<AnimationId>(value, 'AnimationId'); }
/** Creates an AssetId after the input has crossed a validation or creation boundary. */
export function toAssetId(value: string): AssetId { return toBrandedId<AssetId>(value, 'AssetId'); }
/** Creates a SlotId after the input has crossed a validation or creation boundary. */
export function toSlotId(value: string): SlotId { return toBrandedId<SlotId>(value, 'SlotId'); }
/** Creates an AttachmentId after the input has crossed a validation or creation boundary. */
export function toAttachmentId(value: string): AttachmentId { return toBrandedId<AttachmentId>(value, 'AttachmentId'); }
/** Creates a SkinId after the input has crossed a validation or creation boundary. */
export function toSkinId(value: string): SkinId { return toBrandedId<SkinId>(value, 'SkinId'); }
/** Creates a ConstraintId after the input has crossed a validation or creation boundary. */
export function toConstraintId(value: string): ConstraintId { return toBrandedId<ConstraintId>(value, 'ConstraintId'); }
/** Creates a ModularSpriteId after the input has crossed a validation or creation boundary. */
export function toModularSpriteId(value: string): ModularSpriteId { return toBrandedId<ModularSpriteId>(value, 'ModularSpriteId'); }
/** Creates an animation target ID after target identity has been validated. */
export function toAnimationTargetId(value: string): AnimationTargetId { return toBrandedId<AnimationTargetId>(value, 'AnimationTargetId'); }

export type Result<T, E = Error> =
  | { ok: true; data: T; warnings?: string[] }
  | { ok: false; error: E };

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'CYCLE_DETECTED'
  | 'STALE_REVISION'
  | 'TASK_CANCELLED'
  | 'RESOURCE_EXHAUSTED'
  | 'UNSUPPORTED_FORMAT'
  | 'INTERNAL_ERROR';
