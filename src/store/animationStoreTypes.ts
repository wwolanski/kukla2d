import type { AnimationStore } from "./animationStoreTypes.types.js";

export const animationSelectors = {
  activeAnimationId: (state: AnimationStore) => state.activeAnimationId,
  currentTime: (state: AnimationStore) => state.currentTime,
  isPlaying: (state: AnimationStore) => state.isPlaying,
  transport: (state: AnimationStore) => ({
    currentTime: state.currentTime,
    isPlaying: state.isPlaying,
    loop: state.loop,
    fps: state.fps,
    speed: state.speed,
    startFrame: state.startFrame,
    endFrame: state.endFrame,
  }),
  draftPose: (state: AnimationStore) => state.draftPose,
  hasPendingDraft: (state: AnimationStore) =>
    state.draftDirty && state.draftPose.size > 0,
} as const;
