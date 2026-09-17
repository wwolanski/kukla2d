export type NodeId = string & { readonly __brand: "NodeId" };
export type BoneId = string & { readonly __brand: "BoneId" };
export type AssetId = string & { readonly __brand: "AssetId" };
export type AnimationId = string & { readonly __brand: "AnimationId" };
export type SlotId = string & { readonly __brand: "SlotId" };
export type AttachmentId = string & { readonly __brand: "AttachmentId" };
export type SkinId = string & { readonly __brand: "SkinId" };
export type TrackId = string & { readonly __brand: "TrackId" };
export type KeyframeId = string & { readonly __brand: "KeyframeId" };
export type ConstraintId = string & { readonly __brand: "ConstraintId" };
export type EventDefId = string & { readonly __brand: "EventDefId" };
export type ModularSpriteId = string & { readonly __brand: "ModularSpriteId" };
export type AnimationTargetId = NodeId | BoneId | SlotId | ConstraintId;

export type Result<T, E = Error> =
  { ok: true; data: T; warnings?: string[] } | { ok: false; error: E };

export type ErrorCode =
  | "INVALID_INPUT"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "CYCLE_DETECTED"
  | "STALE_REVISION"
  | "TASK_CANCELLED"
  | "RESOURCE_EXHAUSTED"
  | "UNSUPPORTED_FORMAT"
  | "INTERNAL_ERROR";
