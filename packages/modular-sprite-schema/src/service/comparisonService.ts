import { analyzers } from '../analyzers/index.js';
import { assignComponents } from '../assignment/assign.js';

import type { AnalyzerResult, MatchProgressEvent, ModularSpriteSchema, SchemaComparisonResult, SchemaMatchRequest, SchemaMatchResponse, SpriteObservation } from '../contracts/index.js';

export const SCHEMA_MATCH_ALGORITHM_VERSION = 1;
const similarity = (items: AnalyzerResult[]): number => { const scored = items.filter(item => item.status === 'scored' && item.weightBp > 0); const total = scored.reduce((sum, item) => sum + item.weightBp, 0); return total ? Math.round(scored.reduce((sum, item) => sum + item.scoreBp * item.weightBp, 0) / total) : 0; };

export function compareSchema(observation: SpriteObservation, schema: ModularSpriteSchema): SchemaComparisonResult {
  const assigned = assignComponents(observation, schema); const context = { observation, schema, ...assigned };
  const results = analyzers.map(analyzer => { try { return analyzer.analyze(context, { profile: schema.matcherProfile }); } catch (error) { return { analyzerId: analyzer.id, analyzerVersion: analyzer.version, status: 'failed' as const, scoreBp: 0, passed: false, weightBp: schema.matcherProfile.analyzerWeightsBp[analyzer.id] ?? 0, checks: [], diagnostics: [{ code: 'analyzer-failed', severity: 'error' as const, message: error instanceof Error ? error.message : String(error) }] }; } });
  const missingRequiredSlots = schema.slots.filter(slot => slot.required && !assigned.assignments.find(item => item.slotKey === slot.slotKey)?.componentIds.length).map(slot => slot.slotKey);
  const missingOptionalSlots = schema.slots.filter(slot => !slot.required && !assigned.assignments.find(item => item.slotKey === slot.slotKey)?.componentIds.length).map(slot => slot.slotKey);
  const similarityBp = similarity(results); const policy = schema.matcherProfile.verdictPolicy;
  const verdict = similarityBp >= policy.matchThresholdBp && !missingRequiredSlots.length ? 'match' : similarityBp >= policy.possibleMatchThresholdBp ? 'possible-match' : 'no-match';
  return { schemaId: schema.schemaId, schemaRevision: schema.revision, similarityBp, confidence: 'low', analyzers: results, assignments: assigned.assignments, missingRequiredSlots, missingOptionalSlots, unmatchedComponentIds: assigned.unmatchedComponentIds, verdict };
}

export class SchemaComparisonService {
  constructor(private readonly schemas: readonly ModularSpriteSchema[], readonly catalogRevision: string) {}
  #matching(request: SchemaMatchRequest): ModularSpriteSchema[] { return this.schemas.filter(schema => schema.matcherProfile.profileId === request.matcherProfileId || request.matcherProfileId === 'default-v1'); }
  #finish(request: SchemaMatchRequest, matching: readonly ModularSpriteSchema[], matches: SchemaComparisonResult[]): SchemaMatchResponse {
    matches.sort((a, b) => b.similarityBp - a.similarityBp || a.schemaId.localeCompare(b.schemaId));
    const best = matches[0]; if (best) { const second = matches[1]; const margin = best.similarityBp - (second?.similarityBp ?? 0); const schema = matching.find(item => item.schemaId === best.schemaId)!; const p = schema.matcherProfile.verdictPolicy; const failed = best.analyzers.filter(item => item.status === 'failed').length; const unavailable = best.analyzers.filter(item => item.status === 'not-applicable').length; best.confidence = best.similarityBp >= p.highSimilarityBp && margin >= p.highMarginBp && !best.missingRequiredSlots.length && failed === 0 && unavailable <= 2 && request.observation.segmentationQualityBp >= 7000 ? 'high' : best.similarityBp >= p.mediumSimilarityBp && margin >= p.mediumMarginBp ? 'medium' : 'low'; }
    return { requestId: request.requestId, algorithmVersion: SCHEMA_MATCH_ALGORITHM_VERSION, catalogRevision: this.catalogRevision, matches: matches.slice(0, request.limit ?? matches.length) };
  }
  match(request: SchemaMatchRequest, hooks: { throwIfAborted?: () => void; onProgress?: (event: MatchProgressEvent) => void } = {}): SchemaMatchResponse {
    const matching = this.#matching(request); const matches: SchemaComparisonResult[] = [];
    matching.forEach((schema, index) => { hooks.throwIfAborted?.(); matches.push(compareSchema(request.observation, schema)); hooks.onProgress?.({ completed: index + 1, total: matching.length, schemaId: schema.schemaId }); });
    return this.#finish(request, matching, matches);
  }
  async matchAsync(request: SchemaMatchRequest, hooks: { throwIfAborted?: () => void; onProgress?: (event: MatchProgressEvent) => void; checkpoint?: () => Promise<void> } = {}): Promise<SchemaMatchResponse> {
    const matching = this.#matching(request); const matches: SchemaComparisonResult[] = [];
    for (let index = 0; index < matching.length; index += 1) { hooks.throwIfAborted?.(); const schema = matching[index]!; matches.push(compareSchema(request.observation, schema)); hooks.onProgress?.({ completed: index + 1, total: matching.length, schemaId: schema.schemaId }); await (hooks.checkpoint?.() ?? new Promise<void>(resolve => setTimeout(resolve, 0))); }
    hooks.throwIfAborted?.(); return this.#finish(request, matching, matches);
  }
}

export class InMemorySchemaMatchGateway {
  constructor(private readonly schemas: readonly ModularSpriteSchema[], private readonly revision = 'memory-1') {}
  match(request: SchemaMatchRequest, options: { signal?: AbortSignal; onProgress?: (event: MatchProgressEvent) => void } = {}): Promise<SchemaMatchResponse> { if (options.signal?.aborted) return Promise.reject(new DOMException('Schema match cancelled', 'AbortError')); const service = new SchemaComparisonService(this.schemas, this.revision); return Promise.resolve(service.match(request, { throwIfAborted: () => { if (options.signal?.aborted) throw new DOMException('Schema match cancelled', 'AbortError'); }, ...(options.onProgress ? { onProgress: options.onProgress } : {}) })); }
}
