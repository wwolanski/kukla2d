import type { NormalizedRect } from "./geometry.types.js";
import type { ObservedComponent } from "./observation.types.js";

export interface ExpectedComponent extends Omit<
  ObservedComponent,
  "componentId"
> {
  componentKey: string;
}
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
  metric: "foreground-area" | "bounds-area" | "width" | "height";
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
export interface SchemaAssetRef {
  assetId: string;
  mimeType: string;
  width: number;
  height: number;
}
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
  origin: { kind: "builtin" | "user" | "remote"; sourceId?: string };
  createdAt: string;
  updatedAt: string;
}
export interface SpriteSchemaFingerprint {
  canvasAspectRatio: number;
  foregroundBounds: NormalizedRect;
  slots: SchemaSlot[];
  expectedIslandCount: number;
}
export interface PortableSchemaSnapshot {
  formatVersion: 1;
  schemaId: string;
  revision: number;
  compositionId: string;
  name: string;
  slots: SchemaSlot[];
}
