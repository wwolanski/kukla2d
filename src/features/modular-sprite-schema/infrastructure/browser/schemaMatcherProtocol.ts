import type { MatchProgressEvent, ModularSpriteSchema, SchemaMatchRequest, SchemaMatchResponse } from '@kukla2d/modular-sprite-schema';

export type SchemaMatcherWorkerRequest =
  | { type: 'catalog'; catalogRevision: string; schemas: ModularSpriteSchema[] }
  | { type: 'match'; request: SchemaMatchRequest }
  | { type: 'abort'; requestId: string };
export type SchemaMatcherWorkerResponse =
  | { type: 'ready'; catalogRevision: string }
  | { type: 'progress'; requestId: string; event: MatchProgressEvent }
  | { type: 'result'; response: SchemaMatchResponse }
  | { type: 'error'; requestId: string; message: string };

export function assertMatchRequest(value: SchemaMatchRequest): void {
  if (!value.requestId || !value.matcherProfileId || value.observation.observationVersion !== 1 || !Array.isArray(value.observation.components)) throw new Error('Invalid schema match request');
}
export function assertMatchResponse(value: SchemaMatchResponse, requestId: string): void {
  if (value.requestId !== requestId || value.algorithmVersion < 1 || typeof value.catalogRevision !== 'string' || !Array.isArray(value.matches)) throw new Error('Invalid schema match response');
}
