import { create } from "zustand";

import {
  toAnimationTargetId,
  type Animation,
  type AnimationTargetId,
  type ProjectDocument,
} from "@kukla2d/contracts";

import { loadAnimationSettings } from "@/platform/animationSettingsRepository.js";

import { useProjectStore } from "@/store/projectStore";

import { onProjectChanged } from "@/domain/animationLifecycle.js";
import {
  activateAnimationSession,
  synchronizeAnimationSession,
  reconcileAnimationSession,
} from "@/domain/animationSession.js";
import {
  advanceAnimationTransport,
  frameToTime,
} from "@/domain/animationTransport.js";

import {
  type AnimationState,
  type AnimationStore,
  type DraftPoseValue,
} from "./animationStoreTypes.types.js";

interface AnimationTransportState {
  currentTime: number;
  lastTimestamp: number | null;
  isPlaying: boolean;
  loop: boolean;
  speed: number;
  startFrame: number;
  endFrame: number;
  fps: number;
}

interface AnimationTransportResult extends AnimationTransportState {
  advanced: boolean;
  loops?: number;
}

const advanceTransport: (
  state: AnimationTransportState,
  timestamp: number,
) => AnimationTransportResult = advanceAnimationTransport;

type AnimationSessionState = ReturnType<typeof activateAnimationSession>;
type RestPose = AnimationState["restPose"];
type DraftPose = AnimationState["draftPose"];
type DraftAuthoring = AnimationState["draftAuthoring"];
type DraftAuthoringByProperty =
  AnimationState["draftAuthoring"] extends Map<
    AnimationTargetId,
    infer Metadata
  >
    ? Metadata
    : never;
type DraftPoseSnapshot = Record<string, DraftPoseValue>;
type DraftAuthoringSnapshot = Record<string, DraftAuthoringByProperty>;

const activateSession: (clip: Animation) => AnimationSessionState =
  activateAnimationSession;
const synchronizeSessionState: (
  session: AnimationSessionState,
  clip: Animation | null | undefined,
) => AnimationSessionState = synchronizeAnimationSession;
function reconcileSessionState(
  project: ProjectDocument,
  session: AnimationSessionState,
): AnimationSessionState {
  const reconciled = reconcileAnimationSession(project, session);
  return {
    ...reconciled,
    draftPose: new Map(reconciled.draftPose),
  };
}

function createAnimationInitialState(): AnimationState {
  const settings = loadAnimationSettings();
  return {
    activeAnimationId: null,
    currentTime: 0,
    isPlaying: false,
    loop: true,
    loopKeyframes: true,
    fps: settings.fps,
    startFrame: 0,
    endFrame: settings.frameCount,
    speed: settings.speed,
    _lastTimestamp: null,
    loopCount: 0,
    restPose: new Map(),
    draftPose: new Map(),
    draftContext: null,
    draftDirty: false,
    draftRevision: 0,
    draftAuthoring: new Map(),
  };
}

function selectSessionState(state: AnimationStore): AnimationSessionState {
  return {
    activeAnimationId: state.activeAnimationId,
    currentTimeMs: state.currentTime,
    playing: state.isPlaying,
    loop: state.loop,
    loopStartFrame: state.startFrame,
    loopEndFrame: state.endFrame,
    speed: state.speed,
    loopKeyframes: state.loopKeyframes,
    draftPose: state.draftPose,
  };
}

function rememberActiveAnimation(
  id: AnimationState["activeAnimationId"],
): void {
  useProjectStore.getState().updateProject(
    (project) => {
      project.lastActiveAnimationId = id;
    },
    { skipHistory: true },
  );
}

/**
 * AnimationStore — playback state, separate from projectStore.
 * The animation DATA (tracks, keyframes) lives in project.animations.
 * This store holds the runtime playback state and pose overrides.
 */
export const useAnimationStore = create<AnimationStore>()((set, get) => ({
  ...createAnimationInitialState(),

  // ── Setters ──────────────────────────────────────────────────────────────

  setActiveAnimationId: (id) => {
    set({ activeAnimationId: id });
    rememberActiveAnimation(id);
  },

  /**
   * Snapshot every node's transform + opacity.  Call this when entering
   * animation mode so we have a "base pose" to auto-insert at frame 0.
   */
  captureRestPose: (nodes) => {
    const rp: RestPose = new Map();
    for (const n of nodes) {
      const t = n.transform ?? {};
      rp.set(n.id, {
        x: t.x ?? 0,
        y: t.y ?? 0,
        rotation: t.rotation ?? 0,
        scaleX: t.scaleX ?? 1,
        scaleY: t.scaleY ?? 1,
        opacity: n.opacity ?? 1,
      });
    }
    set({ restPose: rp });
  },
  setFps: (fps) => set({ fps: Math.max(1, Math.round(fps)) }),
  setSpeed: (speed) => set({ speed: Math.max(0, Math.min(4, speed)) }),
  setLoop: (loop) => set({ loop }),
  setLoopKeyframes: (loop) => set({ loopKeyframes: loop }),

  setStartFrame: (f) =>
    set((s) => ({
      startFrame: Math.max(0, Math.round(f)),
      // Clamp current time if needed
      currentTime: Math.max(
        (Math.max(0, Math.round(f)) / s.fps) * 1000,
        s.currentTime,
      ),
    })),

  setEndFrame: (f) =>
    set((s) => ({
      endFrame: Math.max(s.startFrame + 1, Math.round(f)),
    })),

  // ── Draft pose actions ────────────────────────────────────────────────────

  /** Merge props into the draft override for one node. */
  setDraftPose: (nodeId, props) =>
    set((s) => {
      const next: DraftPose = new Map(s.draftPose);
      next.set(nodeId, { ...(next.get(nodeId) ?? {}), ...props });
      return { draftPose: next };
    }),

  /** Remove one node's draft (called after K commits it). */
  clearDraftPoseForNode: (nodeId) =>
    set((s) => {
      const next: DraftPose = new Map(s.draftPose);
      next.delete(nodeId);
      const authNext: DraftAuthoring = new Map(s.draftAuthoring);
      authNext.delete(nodeId);
      return { draftPose: next, draftAuthoring: authNext };
    }),

  /** Clear all drafts (called on seek / stop). */
  clearDraftPose: () =>
    set({ draftPose: new Map(), draftAuthoring: new Map() }),

  // ── Draft authoring metadata ─────────────────────────────────────────────

  /** Set provenance metadata for one target's property. */
  setDraftAuthoring: (targetId, property, meta) =>
    set((s) => {
      const next: DraftAuthoring = new Map(s.draftAuthoring);
      const targetMeta: DraftAuthoringByProperty = {
        ...(next.get(targetId) ?? {}),
      };
      targetMeta[property] = meta;
      next.set(targetId, targetMeta);
      return { draftAuthoring: next };
    }),

  /** Clear draft authoring for a target. */
  clearDraftAuthoringForNode: (targetId) =>
    set((s) => {
      const next: DraftAuthoring = new Map(s.draftAuthoring);
      next.delete(targetId);
      return { draftAuthoring: next };
    }),

  /** Clear all draft authoring metadata. */
  clearDraftAuthoring: () => set({ draftAuthoring: new Map() }),

  /** Snapshot draft authoring for cancel/restore. */
  snapshotDraftAuthoring: () => {
    const authoring = get().draftAuthoring;
    const snapshot: DraftAuthoringSnapshot = {};
    for (const [targetId, meta] of authoring) {
      snapshot[targetId] = { ...meta };
    }
    return snapshot;
  },

  /** Restore draft authoring from snapshot. */
  restoreDraftAuthoring: (snapshot) => {
    const next: DraftAuthoring = new Map();
    for (const [targetId, meta] of Object.entries(snapshot ?? {})) {
      next.set(toAnimationTargetId(targetId), { ...meta });
    }
    set({ draftAuthoring: next });
  },

  // ── K3 Authoring draft contract ──────────────────────────────────────────

  /** Set or update the draft context identity (R6). */
  setDraftContext: (ctx) => set({ draftContext: ctx }),

  /** Mark draft as dirty and bump revision. */
  markDraftDirty: () =>
    set((s) => ({
      draftDirty: true,
      draftRevision: s.draftRevision + 1,
    })),

  restoreDraftMetadata: (draftDirty, draftRevision) =>
    set({
      draftDirty,
      draftRevision,
    }),

  /** Snapshot the current draftPose for cancel/restore. */
  snapshotDraftPose: () => {
    const pose = get().draftPose;
    const snapshot: DraftPoseSnapshot = {};
    for (const [nodeId, partial] of pose) {
      snapshot[nodeId] = { ...partial };
    }
    return snapshot;
  },

  /** Restore draftPose from a snapshot (cancel gesture). */
  restoreDraftPose: (snapshot) => {
    const next: DraftPose = new Map();
    for (const [nodeId, partial] of Object.entries(snapshot ?? {})) {
      next.set(toAnimationTargetId(nodeId), { ...partial });
    }
    set({ draftPose: next });
  },

  /** Selective clear: remove committed channels from draft and authoring. */
  clearDraftChannelsForTargets: (targetIds) =>
    set((s) => {
      const next: DraftPose = new Map(s.draftPose);
      const authNext: DraftAuthoring = new Map(s.draftAuthoring);
      for (const id of targetIds) {
        next.delete(id);
        authNext.delete(id);
      }
      return {
        draftPose: next,
        draftAuthoring: authNext,
        draftDirty: next.size > 0,
      };
    }),

  /** Full commit: clear context + draft + authoring. */
  commitDraft: () =>
    set({
      draftContext: null,
      draftDirty: false,
      draftPose: new Map(),
      draftAuthoring: new Map(),
    }),

  // ── Transport ─────────────────────────────────────────────────────────────

  play: () => set({ isPlaying: true, _lastTimestamp: null }),
  pause: () => set({ isPlaying: false, _lastTimestamp: null }),

  stop: () =>
    set((s) => ({
      isPlaying: false,
      currentTime: frameToTime(s.startFrame, s.fps),
      _lastTimestamp: null,
      loopCount: 0,
    })),

  seekFrame: (frame) =>
    set((s) => ({
      currentTime: frameToTime(frame, s.fps),
      _lastTimestamp: null,
      loopCount: 0,
    })),

  seekTime: (ms) =>
    set({ currentTime: ms, _lastTimestamp: null, loopCount: 0 }),

  // ── rAF tick ──────────────────────────────────────────────────────────────
  /**
   * Called from CanvasViewport's rAF loop with the current timestamp (ms).
   * Advances currentTime if playing. Returns true if time advanced (scene needs redraw).
   */
  tick: (timestamp) => {
    const s = get();
    if (!s.isPlaying) return false;
    const next = advanceTransport(
      {
        currentTime: s.currentTime,
        lastTimestamp: s._lastTimestamp,
        isPlaying: s.isPlaying,
        loop: s.loop,
        speed: s.speed,
        startFrame: s.startFrame,
        endFrame: s.endFrame,
        fps: s.fps,
      },
      timestamp,
    );
    set({
      currentTime: next.currentTime,
      isPlaying: next.isPlaying,
      _lastTimestamp: next.lastTimestamp,
      loopCount: s.loopCount + (next.loops ?? 0),
    });
    return next.advanced;
  },

  /**
   * Switch to a new animation clip and reset playback state.
   */
  switchAnimation: (animation) => {
    if (!animation) return;
    const session = activateSession(animation);
    set({
      activeAnimationId: session.activeAnimationId,
      fps: animation.fps ?? 24,
      currentTime: session.currentTimeMs,
      isPlaying: session.playing,
      _lastTimestamp: null,
      draftPose: session.draftPose,
      draftAuthoring: new Map(),
      draftContext: null,
      draftDirty: false,
      draftRevision: 0,
      loopCount: 0,
      startFrame: session.loopStartFrame,
      endFrame: session.loopEndFrame,
    });
    rememberActiveAnimation(session.activeAnimationId);
  },

  /** Reset playback state to default */
  resetPlayback: () => {
    set(createAnimationInitialState());
    rememberActiveAnimation(null);
  },

  /**
   * Synchronize session timing when clip changes.
   * Clamps playhead and loop window to valid range.
   */
  synchronizeSession: (clip) => {
    const s = get();
    const session = synchronizeSessionState(selectSessionState(s), clip);
    set({
      activeAnimationId: session.activeAnimationId,
      currentTime: session.currentTimeMs,
      isPlaying: session.playing,
      fps: clip?.fps ?? s.fps,
      startFrame: session.loopStartFrame,
      endFrame: session.loopEndFrame,
      _lastTimestamp: null,
    });
    rememberActiveAnimation(session.activeAnimationId);
  },

  /**
   * Reconcile runtime session with project state.
   * Called after loadProject, restoreProject (undo/redo),
   * or any external document change that may affect the active clip.
   */
  reconcileRuntimeSession: () => {
    const s = get();
    const project = useProjectStore.getState().project;
    const session = reconcileSessionState(project, selectSessionState(s));
    const activeClip = project.animations?.find(
      (a) => a.id === session.activeAnimationId,
    );
    const clipChanged = session.activeAnimationId !== s.activeAnimationId;
    const draftForeign = clipChanged && s.draftDirty && s.draftPose.size > 0;
    set({
      activeAnimationId: session.activeAnimationId,
      currentTime: session.currentTimeMs,
      isPlaying: session.playing,
      fps: activeClip?.fps ?? s.fps,
      _lastTimestamp: null,
      draftPose: draftForeign
        ? new Map<AnimationTargetId, DraftPoseValue>()
        : session.draftPose,
      draftAuthoring: draftForeign
        ? new Map<AnimationTargetId, DraftAuthoringByProperty>()
        : s.draftAuthoring,
      draftContext: draftForeign ? null : s.draftContext,
      draftDirty: draftForeign ? false : s.draftDirty,
      startFrame: session.loopStartFrame,
      endFrame: session.loopEndFrame,
    });
    rememberActiveAnimation(session.activeAnimationId);
  },
}));

onProjectChanged(() => {
  useAnimationStore.getState().reconcileRuntimeSession();
});
