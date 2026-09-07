export type TaskKind =
  "mesh.generate" | "psd.parse" | "inference.pose" | "export.frames";

export interface TaskRequest<TPayload = unknown> {
  requestId: string;
  kind: TaskKind;
  projectRevision: number;
  payload: TPayload;
  transferables?: readonly Transferable[];
}

export interface TaskProgress {
  requestId: string;
  progress: number;
  stage?: string;
}

export interface TaskResult<TData = unknown> {
  requestId: string;
  projectRevision: number;
  data: TData;
}

export interface TaskError {
  requestId: string;
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
}

export type TaskMessage<TData = unknown> =
  | { type: "progress"; data: TaskProgress }
  | { type: "result"; data: TaskResult<TData> }
  | { type: "error"; data: TaskError };

export type TaskCancellationMessage = { type: "cancel"; requestId: string };

export interface TaskService {
  dispatch<TPayload>(
    request: TaskRequest<TPayload>,
  ): Promise<TaskResult<unknown>>;
  dispatch<TPayload, TData>(
    request: TaskRequest<TPayload>,
    decodeResult: (value: unknown) => TData,
  ): Promise<TaskResult<TData>>;
  cancel(requestId: string): boolean;
  dispose(): void;
}
