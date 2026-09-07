import type { ProjectDocument } from "./project.types.js";

export interface EngineInput {
  project: ProjectDocument;
  time: number;
}

export interface EvaluatedFrame {
  drawList: DrawItem[];
  diagnostics?: FrameDiagnostics;
}

export interface DrawItem {
  id: string;
  type: "mesh" | "quad";
  vertices: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
  transform: Float32Array;
  opacity: number;
  visible: boolean;
  blendMode: string;
  clipRegion?: { x: number; y: number; width: number; height: number };
  textureId?: string;
}

export interface FrameDiagnostics {
  evaluateMs: number;
  drawItemCount: number;
  visibleCount: number;
}

export interface EditorEngine {
  readonly state: EngineLifecycleState;
  setProject(project: ProjectDocument, revision: number): EngineCommandResult;
  setPlayback(input: PlaybackInput): EngineCommandResult;
  evaluate(time: number): EvaluatedFrame;
  start(clock: Clock, sink: FrameSink): EngineCommandResult;
  stop(): EngineCommandResult;
  invalidate(kind: InvalidationKind): EngineCommandResult;
  dispose(): void;
}

export type EngineLifecycleState = "idle" | "running" | "stopped" | "disposed";
export type EngineCommandResult =
  | { ok: true; state: Exclude<EngineLifecycleState, "disposed"> }
  | {
      ok: false;
      state: "disposed" | "stale-revision";
      currentRevision?: number;
    };

export interface FrameScheduler {
  request(callback: () => void): unknown;
  cancel(requestId: unknown): void;
}

export interface PlaybackInput {
  playing: boolean;
  currentTime: number;
  loop: boolean;
  speed: number;
}

export interface Clock {
  now(): number;
}

export interface FrameSink {
  frame(frame: EvaluatedFrame): void;
}

export type InvalidationKind =
  "structure" | "pose" | "geometry" | "asset" | "all";
