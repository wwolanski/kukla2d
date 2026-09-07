import type {
  AnimationId,
  AnimationTargetId,
  AssetId,
  AttachmentId,
  BoneId,
  ConstraintId,
  ModularSpriteId,
  NodeId,
  SkinId,
  SlotId,
} from "./errors.types.js";

function toBrandedId<T extends string>(value: string, label: string): T {
  if (value.trim().length === 0)
    throw new Error(`${label} must be a non-empty string`);
  return value as T;
}

/** Creates a NodeId after the input has crossed a validation or creation boundary. */
export function toNodeId(value: string): NodeId {
  return toBrandedId<NodeId>(value, "NodeId");
}
/** Creates a BoneId after the input has crossed a validation or creation boundary. */
export function toBoneId(value: string): BoneId {
  return toBrandedId<BoneId>(value, "BoneId");
}
/** Creates an AnimationId after the input has crossed a validation or creation boundary. */
export function toAnimationId(value: string): AnimationId {
  return toBrandedId<AnimationId>(value, "AnimationId");
}
/** Creates an AssetId after the input has crossed a validation or creation boundary. */
export function toAssetId(value: string): AssetId {
  return toBrandedId<AssetId>(value, "AssetId");
}
/** Creates a SlotId after the input has crossed a validation or creation boundary. */
export function toSlotId(value: string): SlotId {
  return toBrandedId<SlotId>(value, "SlotId");
}
/** Creates an AttachmentId after the input has crossed a validation or creation boundary. */
export function toAttachmentId(value: string): AttachmentId {
  return toBrandedId<AttachmentId>(value, "AttachmentId");
}
/** Creates a SkinId after the input has crossed a validation or creation boundary. */
export function toSkinId(value: string): SkinId {
  return toBrandedId<SkinId>(value, "SkinId");
}
/** Creates a ConstraintId after the input has crossed a validation or creation boundary. */
export function toConstraintId(value: string): ConstraintId {
  return toBrandedId<ConstraintId>(value, "ConstraintId");
}
/** Creates a ModularSpriteId after the input has crossed a validation or creation boundary. */
export function toModularSpriteId(value: string): ModularSpriteId {
  return toBrandedId<ModularSpriteId>(value, "ModularSpriteId");
}
/** Creates an animation target ID after target identity has been validated. */
export function toAnimationTargetId(value: string): AnimationTargetId {
  return toBrandedId<AnimationTargetId>(value, "AnimationTargetId");
}
