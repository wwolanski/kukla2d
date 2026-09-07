import type { AnimationId } from "@kukla2d/contracts";

import type {
  ProjectActions,
  ProjectCommandResult,
} from "@/store/project/projectStoreTypes.types.js";

import type { CreateAnimationClipPayload } from "@/domain/animationCommandTypes.types.js";

export interface TimelineCommandApi extends Pick<
  ProjectActions,
  | "renameAnimationClip"
  | "deleteAnimationClip"
  | "updateAnimationTiming"
  | "upsertAnimationKeyframe"
  | "upsertAnimationKeyframes"
  | "editAnimationKeyframes"
  | "moveAnimationKeyframes"
  | "deleteAnimationKeyframes"
  | "setAnimationKeyframeEasing"
  | "addAnimationMarker"
  | "addAnimationAudioTrack"
  | "updateAnimationAudioTrack"
  | "removeAnimationAudioTrack"
  | "setAnimationTargetBoomerang"
> {
  selectAnimationClip: (animationId: AnimationId) => AnimationId | null;
  ensureAnimationClip: () => AnimationId | null;
  createAnimationClip: (
    payload?: CreateAnimationClipPayload & { frameCount?: number },
  ) => ProjectCommandResult;
  beginAudioTrackGesture: (name: string) => void;
  endAudioTrackGesture: () => void;
}
