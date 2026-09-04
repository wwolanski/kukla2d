export interface NormalizedPoint { x: number; y: number }
export interface NormalizedRect extends NormalizedPoint { width: number; height: number }

export type SemanticDefinitionKind = 'part-role' | 'character-type' | 'character-class';
export interface SemanticDefinition {
  id: string;
  revision: number;
  kind: SemanticDefinitionKind;
  key: string;
  label: string;
  description?: string;
  parentId?: string;
  aliases: string[];
  origin: 'builtin' | 'user' | 'remote';
}

export interface EncodedBinaryMask { width: number; height: number; data: Uint8Array }
export interface ObservedComponent {
  componentId: number;
  bounds: NormalizedRect;
  centroid: NormalizedPoint;
  foregroundAreaRatio: number;
  boundingBoxAreaRatio: number;
  aspectRatio: number;
  shapeMask: EncodedBinaryMask;
}
export interface SpriteObservation {
  observationVersion: 1;
  processorVersion: 1;
  canvas: { width: number; height: number; aspectRatio: number };
  foregroundBounds: NormalizedRect;
  components: ObservedComponent[];
  segmentationQualityBp: number;
}
export type SpriteObservationDto = SpriteObservation;

export interface ExpectedComponent extends Omit<ObservedComponent, 'componentId'> { componentKey: string }
export interface SchemaSlot {
  slotKey: string;
  label: string;
  semanticRoleId?: string;
  qualifiers: Record<string, string>;
  parentSlotKey?: string;
  required: boolean;
  drawOrder: number;
  components: ExpectedComponent[];
}
export interface SizeRatioRule {
  ruleId: string;
  leftSlotKey: string;
  rightSlotKey: string;
  metric: 'foreground-area' | 'bounds-area' | 'width' | 'height';
  expectedRatio: number;
  tolerance: number;
  weightBp: number;
}
export interface VerdictPolicy {
  version: number;
  matchThresholdBp: number;
  possibleMatchThresholdBp: number;
  highSimilarityBp: number;
  highMarginBp: number;
  mediumSimilarityBp: number;
  mediumMarginBp: number;
}
export interface MatcherProfile {
  profileId: string;
  analyzerWeightsBp: Record<string, number>;
  passThresholdBp: number;
  positionTolerance: number;
  sizeTolerance: number;
  aspectRatioTolerance: number;
  shapeMaskSize: number;
  sizeRatioRules: SizeRatioRule[];
  verdictPolicy: VerdictPolicy;
}
export interface SchemaAssetRef { assetId: string; mimeType: string; width: number; height: number }
export interface ModularSpriteSchema {
  formatVersion: 1;
  schemaId: string;
  revision: number;
  compositionId: string;
  name: string;
  description: string;
  characterTypeIds: string[];
  characterClassIds: string[];
  tags: string[];
  slots: SchemaSlot[];
  fingerprint: SpriteSchemaFingerprint;
  matcherProfile: MatcherProfile;
  referenceAsset: SchemaAssetRef;
  thumbnailAsset?: SchemaAssetRef;
  origin: { kind: 'builtin' | 'user' | 'remote'; sourceId?: string };
  createdAt: string;
  updatedAt: string;
}
export interface SpriteSchemaFingerprint {
  canvasAspectRatio: number;
  foregroundBounds: NormalizedRect;
  slots: SchemaSlot[];
  expectedIslandCount: number;
}
export type ComparisonPhase = 'global' | 'assignment' | 'relational';
export type MetricValue = number | string | boolean | number[] | NormalizedPoint | NormalizedRect | Record<string, number | string | boolean>;
export interface MetricCheck {
  id: string;
  label: string;
  scoreBp: number;
  passed: boolean;
  expected: MetricValue;
  actual: MetricValue;
  tolerance?: MetricValue;
}
export interface Diagnostic { code: string; severity: 'info' | 'warning' | 'error'; message: string }
export interface AnalyzerResult {
  analyzerId: string;
  analyzerVersion: number;
  status: 'scored' | 'not-applicable' | 'failed';
  scoreBp: number;
  passed: boolean;
  weightBp: number;
  checks: MetricCheck[];
  diagnostics: Diagnostic[];
}
export interface SlotAssignment { slotKey: string; componentIds: number[]; scoreBp: number }
export interface SchemaComparisonResult {
  schemaId: string;
  schemaRevision: number;
  similarityBp: number;
  confidence: 'high' | 'medium' | 'low';
  analyzers: AnalyzerResult[];
  assignments: SlotAssignment[];
  missingRequiredSlots: string[];
  missingOptionalSlots: string[];
  unmatchedComponentIds: number[];
  verdict: 'match' | 'possible-match' | 'no-match';
}
export interface MatchProgressEvent { completed: number; total: number; schemaId?: string }
export interface SchemaMatchRequest { requestId: string; observation: SpriteObservationDto; limit?: number; matcherProfileId: string }
export interface SchemaMatchResponse { requestId: string; algorithmVersion: number; catalogRevision: string; matches: SchemaComparisonResult[] }
export interface SchemaMatchGateway {
  match(request: SchemaMatchRequest, options?: { signal?: AbortSignal; onProgress?: (event: MatchProgressEvent) => void }): Promise<SchemaMatchResponse>;
}
export interface PortableSchemaSnapshot { formatVersion: 1; schemaId: string; revision: number; compositionId: string; name: string; slots: SchemaSlot[] }

export interface ComparisonContext {
  observation: SpriteObservation;
  schema: ModularSpriteSchema;
  assignments: SlotAssignment[];
  unmatchedComponentIds: number[];
}
export interface AnalyzerRuntime { profile: MatcherProfile }
export interface ComparisonAnalyzer<TContext = ComparisonContext> {
  readonly id: string;
  readonly version: number;
  readonly phase: ComparisonPhase;
  analyze(context: TContext, runtime: AnalyzerRuntime): AnalyzerResult;
}
