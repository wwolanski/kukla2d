import type {
  AnimationId,
  AnimationTargetId,
  AudioTrack,
  KeyframeAuthoringMeta,
} from "@kukla2d/contracts";

export type AnimationCommandResult =
  | { changed: true; affectedIds: string[] }
  | { changed: false; affectedIds: string[] };

export interface CreateAnimationClipPayload {
  animationId?: AnimationId;
  id?: string;
  name?: string;
  durationMs?: number;
  fps?: number;
}

export interface UpdateAnimationTimingPayload {
  animationId: AnimationId;
  durationMs?: number;
  fps?: number;
}

export type AnimationEasing = string | [number, number, number, number];

export interface AnimationKeyframeInput {
  targetId: AnimationTargetId;
  property: string;
  timeMs: number;
  value: unknown;
  easing?: AnimationEasing;
  authoring?: KeyframeAuthoringMeta;
}

export interface UpsertAnimationKeyframePayload extends AnimationKeyframeInput {
  animationId: AnimationId;
}

export interface UpsertAnimationKeyframesPayload {
  animationId: AnimationId;
  keyframes: AnimationKeyframeInput[];
}

export interface EditAnimationKeyframesPayload {
  animationId: AnimationId;
  edits: (AnimationKeyframeInput & { originalTimeMs?: number })[];
}

export interface MoveAnimationKeyframesPayload {
  animationId: AnimationId;
  keyframes: {
    targetId: AnimationTargetId;
    timeMs: number;
    property?: string;
  }[];
  deltaMs: number;
}

export interface DeleteAnimationKeyframesPayload {
  animationId: AnimationId;
  keyframes: {
    targetId: AnimationTargetId;
    timeMs: number;
    property?: string;
  }[];
}

export interface SetAnimationKeyframeEasingPayload extends DeleteAnimationKeyframesPayload {
  easing: AnimationEasing;
}

export interface AddAnimationMarkerPayload {
  animationId: AnimationId;
  timeMs: number;
  label?: string;
  markerId?: string;
}

export interface AddAnimationAudioTrackPayload {
  animationId: AnimationId;
  audioTrackId?: string;
  name?: string;
  source?: string | null;
  sourceUrl?: string | null;
  mimeType?: string | null;
  audioDurationMs?: number;
  audioStartMs?: number;
  audioEndMs?: number | null;
  timelineStartMs?: number;
}

export interface UpdateAnimationAudioTrackPayload {
  animationId: AnimationId;
  audioTrackId: string;
  patch?: Partial<Omit<AudioTrack, "id">>;
}

export interface RemoveAnimationAudioTrackPayload {
  animationId: AnimationId;
  audioTrackId: string;
}

export interface SetAnimationTargetBoomerangPayload {
  animationId: AnimationId;
  targetId: AnimationTargetId;
  enabled: boolean;
}
