import type {
  Animation,
  AnimationId,
  AnimationTargetId,
  KeyframeAuthoringMeta,
  Node,
} from "@kukla2d/contracts";

interface RestPoseValue {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
}

export interface DraftPoseValue {
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  pivotX?: number;
  pivotY?: number;
  opacity?: number;
  mesh_verts?: unknown;
  [property: string]: unknown;
}

interface AnimationDraftContext {
  animationId: AnimationId;
  timeMs: number;
}

type RestPose = Map<AnimationTargetId, RestPoseValue>;
export type DraftPose = Map<AnimationTargetId, DraftPoseValue>;
type DraftAuthoringByProperty = Record<string, KeyframeAuthoringMeta>;
type DraftAuthoring = Map<AnimationTargetId, DraftAuthoringByProperty>;
type DraftPoseSnapshot = Record<string, DraftPoseValue>;
type DraftAuthoringSnapshot = Record<string, DraftAuthoringByProperty>;

export interface AnimationState {
  activeAnimationId: AnimationId | null;
  currentTime: number;
  isPlaying: boolean;
  loop: boolean;
  loopKeyframes: boolean;
  fps: number;
  startFrame: number;
  endFrame: number;
  speed: number;
  _lastTimestamp: number | null;
  loopCount: number;
  restPose: RestPose;
  draftPose: DraftPose;
  draftContext: AnimationDraftContext | null;
  draftDirty: boolean;
  draftRevision: number;
  draftAuthoring: DraftAuthoring;
}

interface AnimationActions {
  setActiveAnimationId: (id: AnimationId | null) => void;
  captureRestPose: (
    nodes: readonly Pick<Node, "id" | "transform" | "opacity">[],
  ) => void;
  setFps: (fps: number) => void;
  setSpeed: (speed: number) => void;
  setLoop: (loop: boolean) => void;
  setLoopKeyframes: (loop: boolean) => void;
  setStartFrame: (frame: number) => void;
  setEndFrame: (frame: number) => void;
  setDraftPose: (targetId: AnimationTargetId, props: DraftPoseValue) => void;
  clearDraftPoseForNode: (targetId: AnimationTargetId) => void;
  clearDraftPose: () => void;
  setDraftAuthoring: (
    targetId: AnimationTargetId,
    property: string,
    meta: KeyframeAuthoringMeta,
  ) => void;
  clearDraftAuthoringForNode: (targetId: AnimationTargetId) => void;
  clearDraftAuthoring: () => void;
  snapshotDraftAuthoring: () => DraftAuthoringSnapshot;
  restoreDraftAuthoring: (snapshot: DraftAuthoringSnapshot) => void;
  setDraftContext: (context: AnimationDraftContext | null) => void;
  markDraftDirty: () => void;
  restoreDraftMetadata: (dirty: boolean, revision: number) => void;
  snapshotDraftPose: () => DraftPoseSnapshot;
  restoreDraftPose: (snapshot: DraftPoseSnapshot) => void;
  clearDraftChannelsForTargets: (
    targetIds: readonly AnimationTargetId[],
  ) => void;
  commitDraft: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekFrame: (frame: number) => void;
  seekTime: (timeMs: number) => void;
  tick: (timestamp: number) => boolean;
  switchAnimation: (animation: Animation | null | undefined) => void;
  resetPlayback: () => void;
  synchronizeSession: (clip: Animation | null | undefined) => void;
  reconcileRuntimeSession: () => void;
}

export type AnimationStore = AnimationState & AnimationActions;
