import type {
  TaskError,
  TaskKind,
  TaskMessage,
  TaskProgress,
  TaskRequest,
  TaskResult,
  TaskService,
} from '@kukla2d/contracts';

export type BrowserTaskServiceState = 'active' | 'disposed';
export type BrowserTaskFailureState = 'cancelled' | 'disposed' | 'stale-revision' | 'worker-error' | 'invalid-message';

export class BrowserTaskServiceError extends Error {
  constructor(
    readonly state: BrowserTaskFailureState,
    message: string,
    readonly taskError?: TaskError,
  ) {
    super(message);
    this.name = 'BrowserTaskServiceError';
  }
}

export type TaskMessageParseResult =
  | { ok: true; message: TaskMessage<unknown> }
  | { ok: false; error: { code: 'INVALID_MESSAGE'; message: string } };

interface PendingTask {
  worker: Worker;
  handler: (event: MessageEvent<unknown>) => void;
  reject: (reason: BrowserTaskServiceError) => void;
}

export interface BrowserTaskServiceOptions {
  workerFactory?: (kind: TaskKind) => Worker;
  onProgress?: (progress: TaskProgress) => void;
}

export class BrowserTaskService implements TaskService {
  readonly tasks = new Map<string, PendingTask>();
  readonly workers = new Map<TaskKind, Worker>();
  readonly maxWorkers: number;
  state: BrowserTaskServiceState = 'active';
  private readonly workerFactory: (kind: TaskKind) => Worker;
  private readonly onProgress: ((progress: TaskProgress) => void) | undefined;

  constructor(options: BrowserTaskServiceOptions = {}) {
    this.maxWorkers = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1));
    this.workerFactory = options.workerFactory ?? createDefaultWorker;
    this.onProgress = options.onProgress;
  }

  dispatch<TPayload>(request: TaskRequest<TPayload>): Promise<TaskResult<unknown>>;
  dispatch<TPayload, TData>(
    request: TaskRequest<TPayload>,
    decodeResult: (value: unknown) => TData,
  ): Promise<TaskResult<TData>>;
  dispatch<TPayload, TData>(
    request: TaskRequest<TPayload>,
    decodeResult?: (value: unknown) => TData,
  ): Promise<TaskResult<unknown>> {
    if (this.state === 'disposed') {
      return Promise.reject(new BrowserTaskServiceError('disposed', 'Task service is disposed'));
    }
    if (!isValidRequest(request)) {
      return Promise.reject(new BrowserTaskServiceError('invalid-message', 'Invalid task request'));
    }
    if (this.tasks.has(request.requestId)) {
      return Promise.reject(new BrowserTaskServiceError('invalid-message', `Duplicate requestId: ${request.requestId}`));
    }
    let worker: Worker;
    try {
      worker = this.getWorker(request.kind);
    } catch (error: unknown) {
      return Promise.reject(error instanceof BrowserTaskServiceError
        ? error
        : new BrowserTaskServiceError('worker-error', error instanceof Error ? error.message : 'Worker creation failed'));
    }
    return new Promise<TaskResult<unknown>>((resolve, reject) => {
      const cleanup = (): void => {
        worker.removeEventListener('message', handler);
        this.tasks.delete(request.requestId);
      };
      const handler = (event: MessageEvent<unknown>): void => {
        const parsed = parseTaskMessage(event.data);
        if (!parsed.ok) {
          cleanup();
          reject(new BrowserTaskServiceError('invalid-message', parsed.error.message));
          return;
        }
        const message = parsed.message;
        if (message.data.requestId !== request.requestId) return;
        if (message.type === 'progress') {
          this.onProgress?.(message.data);
          return;
        }
        cleanup();
        if (message.type === 'error') {
          reject(new BrowserTaskServiceError('worker-error', message.data.message, message.data));
          return;
        }
        if (message.data.projectRevision !== request.projectRevision) {
          reject(new BrowserTaskServiceError('stale-revision', 'Stale revision'));
          return;
        }
        try {
          const data = decodeResult ? decodeResult(message.data.data) : message.data.data;
          resolve({ requestId: message.data.requestId, projectRevision: message.data.projectRevision, data });
        } catch (error: unknown) {
          reject(new BrowserTaskServiceError(
            'invalid-message',
            error instanceof Error ? error.message : 'Task result decoder failed',
          ));
        }
      };
      this.tasks.set(request.requestId, { worker, handler, reject });
      worker.addEventListener('message', handler);
      worker.postMessage(
        {
          requestId: request.requestId,
          kind: request.kind,
          projectRevision: request.projectRevision,
          payload: request.payload,
        },
        request.transferables ? [...request.transferables] : [],
      );
    });
  }

  cancel(requestId: string): boolean {
    const task = this.tasks.get(requestId);
    if (!task) return false;
    task.worker.removeEventListener('message', task.handler);
    this.tasks.delete(requestId);
    task.worker.postMessage({ type: 'cancel', requestId });
    task.reject(new BrowserTaskServiceError('cancelled', 'Task cancelled'));
    return true;
  }

  getWorker(kind: TaskKind): Worker {
    const existing = this.workers.get(kind);
    if (existing) return existing;
    const worker = this.workerFactory(kind);
    this.workers.set(kind, worker);
    return worker;
  }

  dispose(): void {
    if (this.state === 'disposed') return;
    for (const [requestId, task] of this.tasks) {
      task.worker.removeEventListener('message', task.handler);
      task.reject(new BrowserTaskServiceError('disposed', 'Task service disposed'));
      this.tasks.delete(requestId);
    }
    for (const worker of this.workers.values()) worker.terminate();
    this.workers.clear();
    this.state = 'disposed';
  }
}

export function parseTaskMessage(value: unknown): TaskMessageParseResult {
  if (!isRecord(value) || (value.type !== 'progress' && value.type !== 'result' && value.type !== 'error')
    || !isRecord(value.data) || typeof value.data.requestId !== 'string') {
    return invalidMessage('Worker message has invalid envelope');
  }
  const data = value.data;
  const requestId = data.requestId;
  if (typeof requestId !== 'string') return invalidMessage('Worker requestId is invalid');
  if (value.type === 'progress') {
    if (!isFiniteNumber(data.progress) || data.progress < 0 || data.progress > 1
      || (data.stage !== undefined && typeof data.stage !== 'string')) {
      return invalidMessage('Worker progress message is invalid');
    }
    return {
      ok: true,
      message: {
        type: 'progress',
        data: {
          requestId,
          progress: data.progress,
          ...(typeof data.stage === 'string' ? { stage: data.stage } : {}),
        },
      },
    };
  }
  if (value.type === 'result') {
    if (!isRevision(data.projectRevision) || !('data' in data)) return invalidMessage('Worker result message is invalid');
    return { ok: true, message: { type: 'result', data: { requestId, projectRevision: data.projectRevision, data: data.data } } };
  }
  if (typeof data.code !== 'string' || typeof data.message !== 'string' || typeof data.retryable !== 'boolean') {
    return invalidMessage('Worker error message is invalid');
  }
  return {
    ok: true,
    message: {
      type: 'error',
      data: {
        requestId,
        code: data.code,
        message: data.message,
        retryable: data.retryable,
        ...('details' in data ? { details: data.details } : {}),
      },
    },
  };
}

function createDefaultWorker(kind: TaskKind): Worker {
  if (kind !== 'mesh.generate') throw new BrowserTaskServiceError('invalid-message', `Unsupported browser task kind: ${kind}`);
  return new Worker(
    new URL('../../../src/features/canvas/infrastructure/mesh-worker/worker.ts', import.meta.url),
    { type: 'module' },
  );
}

function isValidRequest<TPayload>(request: TaskRequest<TPayload>): boolean {
  return request.requestId.length > 0 && isRevision(request.projectRevision)
    && ['mesh.generate', 'psd.parse', 'inference.pose', 'export.frames'].includes(request.kind);
}
function invalidMessage(message: string): TaskMessageParseResult {
  return { ok: false, error: { code: 'INVALID_MESSAGE', message } };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function isRevision(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0; }
