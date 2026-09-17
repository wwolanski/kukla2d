import type { NormalizedPoint, NormalizedRect } from "./geometry.types.js";
import type {
  SpriteObservation,
  SpriteObservationDto,
} from "./observation.types.js";
import type { MatcherProfile, ModularSpriteSchema } from "./schema.types.js";

export type ComparisonPhase = "global" | "assignment" | "relational";
export type MetricValue =
  | number
  | string
  | boolean
  | number[]
  | NormalizedPoint
  | NormalizedRect
  | Record<string, number | string | boolean>;
export interface MetricCheck {
  id: string;
  label: string;
  scoreBp: number;
  passed: boolean;
  expected: MetricValue;
  actual: MetricValue;
  tolerance?: MetricValue;
}
export interface Diagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
}
export interface AnalyzerResult {
  analyzerId: string;
  analyzerVersion: number;
  status: "scored" | "not-applicable" | "failed";
  scoreBp: number;
  passed: boolean;
  weightBp: number;
  checks: MetricCheck[];
  diagnostics: Diagnostic[];
}
export interface SlotAssignment {
  slotKey: string;
  componentIds: number[];
  scoreBp: number;
}
export interface SchemaComparisonResult {
  schemaId: string;
  schemaRevision: number;
  similarityBp: number;
  confidence: "high" | "medium" | "low";
  analyzers: AnalyzerResult[];
  assignments: SlotAssignment[];
  missingRequiredSlots: string[];
  missingOptionalSlots: string[];
  unmatchedComponentIds: number[];
  verdict: "match" | "possible-match" | "no-match";
}
export interface MatchProgressEvent {
  completed: number;
  total: number;
  schemaId?: string;
}
export interface SchemaMatchRequest {
  requestId: string;
  observation: SpriteObservationDto;
  limit?: number;
  matcherProfileId: string;
}
export interface SchemaMatchResponse {
  requestId: string;
  algorithmVersion: number;
  catalogRevision: string;
  matches: SchemaComparisonResult[];
}
export interface SchemaMatchGateway {
  match(
    request: SchemaMatchRequest,
    options?: {
      signal?: AbortSignal;
      onProgress?: (event: MatchProgressEvent) => void;
    },
  ): Promise<SchemaMatchResponse>;
}

export interface ComparisonContext {
  observation: SpriteObservation;
  schema: ModularSpriteSchema;
  assignments: SlotAssignment[];
  unmatchedComponentIds: number[];
}
export interface AnalyzerRuntime {
  profile: MatcherProfile;
}
export interface ComparisonAnalyzer<TContext = ComparisonContext> {
  readonly id: string;
  readonly version: number;
  readonly phase: ComparisonPhase;
  analyze(context: TContext, runtime: AnalyzerRuntime): AnalyzerResult;
}
