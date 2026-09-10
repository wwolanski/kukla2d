import type {
  ModularSpriteDocument,
  ModularSpriteId,
  ModularSpriteProcessingRecipe,
} from "@kukla2d/contracts";
import type {
  ModularSpriteSchema,
  SchemaComparisonResult,
} from "@kukla2d/modular-sprite-schema";

import type {
  ProcessedModularSprite,
  RgbaImageData,
} from "../domain/contracts.types.js";
import type { RegionGrouping } from "../domain/partGrouping.types.js";

export type ModularSpriteWizardStep =
  "source" | "background" | "regions" | "parts" | "review";
type WizardStatus =
  | "idle"
  | "loading"
  | "processing"
  | "ready"
  | "finalizing"
  | "failure"
  | "success";

interface WizardSchemaState {
  schemas: ModularSpriteSchema[];
  matches: SchemaComparisonResult[];
  applied: {
    schema: ModularSpriteSchema;
    match: SchemaComparisonResult;
    modified: boolean;
  } | null;
  matching: boolean;
  progress: { completed: number; total: number };
  autoMatch: boolean;
  addSchema: boolean;
  saveMode: "new" | "revision";
  metadata: {
    name: string;
    description: string;
    characterTypeIds: string[];
    characterClassIds: string[];
    tags: string[];
  };
}

export interface WizardState {
  step: ModularSpriteWizardStep;
  status: WizardStatus;
  source: {
    file: File;
    image: RgbaImageData;
    preview: RgbaImageData;
    existingDocument?: ModularSpriteDocument;
  } | null;
  recipe: ModularSpriteProcessingRecipe;
  processingResult: ProcessedModularSprite | null;
  grouping: RegionGrouping | null;
  groupingTouched: boolean;
  schema: WizardSchemaState;
  history: {
    recipe: ModularSpriteProcessingRecipe;
    grouping: RegionGrouping | null;
    groupingTouched: boolean;
  }[];
  future: {
    recipe: ModularSpriteProcessingRecipe;
    grouping: RegionGrouping | null;
    groupingTouched: boolean;
  }[];
  error: string | null;
  progress: { value: number; stage: string };
  name: string;
  addToCanvas: boolean;
  processingRevision: number;
  existingId: ModularSpriteId | null;
  lastHistory: { at: number; kind: "recipe" | "discrete" | "parts" } | null;
}
