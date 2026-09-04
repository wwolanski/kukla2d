/// <reference lib="webworker" />
import { SchemaComparisonService, type ModularSpriteSchema } from '@kukla2d/modular-sprite-schema';

import { assertMatchRequest, type SchemaMatcherWorkerRequest, type SchemaMatcherWorkerResponse } from './schemaMatcherProtocol.js';

const scope = self as DedicatedWorkerGlobalScope;
let schemas: ModularSpriteSchema[] = []; let catalogRevision = 'empty'; const aborted = new Set<string>();
scope.onmessage = (event: MessageEvent<SchemaMatcherWorkerRequest>) => {
  const message = event.data;
  if (message.type === 'catalog') { schemas = message.schemas; catalogRevision = message.catalogRevision; scope.postMessage({ type: 'ready', catalogRevision } satisfies SchemaMatcherWorkerResponse); return; }
  if (message.type === 'abort') { aborted.add(message.requestId); return; }
  const request = message.request;
  void (async()=>{try { assertMatchRequest(request); const service = new SchemaComparisonService(schemas, catalogRevision); const response = await service.matchAsync(request, { throwIfAborted: () => { if (aborted.has(request.requestId)) throw new DOMException('Schema match cancelled','AbortError'); }, onProgress: progress => scope.postMessage({ type: 'progress', requestId: request.requestId, event: progress } satisfies SchemaMatcherWorkerResponse) }); if (!aborted.has(request.requestId)) scope.postMessage({ type: 'result', response } satisfies SchemaMatcherWorkerResponse); }
  catch (error) { if(!aborted.has(request.requestId))scope.postMessage({ type: 'error', requestId: request.requestId, message: error instanceof Error ? error.message : String(error) } satisfies SchemaMatcherWorkerResponse); }
  finally { aborted.delete(request.requestId); }})();
};
