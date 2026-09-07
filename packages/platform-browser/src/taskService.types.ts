import type { TaskKind, TaskMessage, TaskProgress } from "@kukla2d/contracts";

export type BrowserTaskServiceState = "active" | "disposed";
export type BrowserTaskFailureState =
  | "cancelled"
  | "disposed"
  | "stale-revision"
  | "worker-error"
  | "invalid-message";

export type TaskMessageParseResult =
  | { ok: true; message: TaskMessage<unknown> }
  | { ok: false; error: { code: "INVALID_MESSAGE"; message: string } };

export interface BrowserTaskServiceOptions {
  workerFactory?: (kind: TaskKind) => Worker;
  onProgress?: (progress: TaskProgress) => void;
}
