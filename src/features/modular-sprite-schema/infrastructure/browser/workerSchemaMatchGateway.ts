import {
  observationHash,
  SCHEMA_MATCH_ALGORITHM_VERSION,
  type MatchProgressEvent,
  type ModularSpriteSchema,
  type SchemaMatchRequest,
  type SchemaMatchResponse,
} from "@kukla2d/modular-sprite-schema";

import workerUrl from "./schemaMatcher.worker.ts?worker&url";
import {
  assertMatchRequest,
  assertMatchResponse,
  type SchemaMatcherWorkerRequest,
  type SchemaMatcherWorkerResponse,
} from "./schemaMatcherProtocol.js";

import type { CatalogAwareSchemaMatchGateway } from "../../application/localSchemaApi.types.js";

interface Pending {
  resolve: (value: SchemaMatchResponse) => void;
  reject: (reason: Error) => void;
  progress?: (event: MatchProgressEvent) => void;
  cleanup: () => void;
}
export class WorkerSchemaMatchGateway implements CatalogAwareSchemaMatchGateway {
  #worker: Worker | null = null;
  #pending = new Map<string, Pending>();
  #cache = new Map<string, SchemaMatchResponse>();
  #revision = "empty";
  constructor(
    private readonly factory: (
      url: string | URL,
      options: WorkerOptions,
    ) => Worker = (url, options) => new Worker(url, options),
  ) {}
  #ensure(): Worker {
    if (this.#worker) return this.#worker;
    const worker = this.factory(workerUrl, { type: "module" });
    worker.onmessage = (event: MessageEvent<SchemaMatcherWorkerResponse>) => {
      const message = event.data;
      if (message.type === "ready") return;
      const requestId =
        message.type === "result"
          ? message.response.requestId
          : message.requestId;
      const pending = this.#pending.get(requestId);
      if (!pending) return;
      if (message.type === "progress") {
        pending.progress?.(message.event);
        return;
      }
      const cacheKey = this.#keyForRequest(requestId);
      this.#pending.delete(requestId);
      pending.cleanup();
      if (message.type === "error") pending.reject(new Error(message.message));
      else {
        try {
          assertMatchResponse(message.response, requestId);
          this.#cache.set(cacheKey, message.response);
          pending.resolve(structuredClone(message.response));
        } catch (error) {
          pending.reject(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
    };
    worker.onerror = (event) => {
      const error =
        event.error instanceof Error
          ? event.error
          : new Error(event.message || "Schema matcher worker failed");
      for (const pending of this.#pending.values()) {
        pending.cleanup();
        pending.reject(error);
      }
      this.#pending.clear();
      this.#worker = null;
    };
    this.#worker = worker;
    return worker;
  }
  #requestKeys = new Map<string, string>();
  #keyForRequest(requestId: string, revision = this.#revision): string {
    return this.#requestKeys.get(requestId) ?? `${requestId}:${revision}`;
  }
  setCatalog(
    schemas: readonly ModularSpriteSchema[],
    catalogRevision: string,
  ): void {
    this.#revision = catalogRevision;
    this.#cache.clear();
    this.#ensure().postMessage({
      type: "catalog",
      schemas: [...structuredClone(schemas)],
      catalogRevision,
    } satisfies SchemaMatcherWorkerRequest);
  }
  match(
    request: SchemaMatchRequest,
    options: {
      signal?: AbortSignal;
      onProgress?: (event: MatchProgressEvent) => void;
    } = {},
  ): Promise<SchemaMatchResponse> {
    assertMatchRequest(request);
    if (options.signal?.aborted)
      return Promise.reject(
        new DOMException("Schema match cancelled", "AbortError"),
      );
    const key = `${observationHash(request.observation)}:${this.#revision}:${SCHEMA_MATCH_ALGORITHM_VERSION}:${request.matcherProfileId}:${request.limit ?? "all"}`;
    const cached = this.#cache.get(key);
    if (cached)
      return Promise.resolve({
        ...structuredClone(cached),
        requestId: request.requestId,
      });
    this.#requestKeys.set(request.requestId, key);
    const worker = this.#ensure();
    return new Promise((resolve, reject) => {
      const abort = () => {
        worker.postMessage({
          type: "abort",
          requestId: request.requestId,
        } satisfies SchemaMatcherWorkerRequest);
        this.#pending.delete(request.requestId);
        this.#requestKeys.delete(request.requestId);
        reject(new DOMException("Schema match cancelled", "AbortError"));
      };
      options.signal?.addEventListener("abort", abort, { once: true });
      this.#pending.set(request.requestId, {
        resolve,
        reject,
        ...(options.onProgress ? { progress: options.onProgress } : {}),
        cleanup: () => {
          options.signal?.removeEventListener("abort", abort);
          this.#requestKeys.delete(request.requestId);
        },
      });
      worker.postMessage({
        type: "match",
        request: structuredClone(request),
      } satisfies SchemaMatcherWorkerRequest);
    });
  }
  dispose(): void {
    for (const [id, pending] of this.#pending) {
      pending.cleanup();
      pending.reject(new DOMException("Schema match cancelled", "AbortError"));
      this.#worker?.postMessage({
        type: "abort",
        requestId: id,
      } satisfies SchemaMatcherWorkerRequest);
    }
    this.#pending.clear();
    this.#worker?.terminate();
    this.#worker = null;
  }
}
