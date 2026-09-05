import type { ModularSpriteDocument, ModularSpriteId, ModularSpriteProcessingRecipe } from '@kukla2d/contracts';
import type { ModularSpriteSchema, SchemaComparisonResult } from '@kukla2d/modular-sprite-schema';

import { DEFAULT_MODULAR_SPRITE_RECIPE, type ProcessedModularSprite, type RgbaImageData } from '../domain/contracts.js';

import type { RegionGrouping } from '../domain/partGrouping.js';

export type ModularSpriteWizardStep = 'source' | 'background' | 'regions' | 'parts' | 'review';
export type WizardStatus = 'idle' | 'loading' | 'processing' | 'ready' | 'finalizing' | 'failure' | 'success';
export type WizardHistoryKind = 'recipe' | 'discrete' | 'parts';

export interface WizardSource {
  file: File;
  image: RgbaImageData;
  preview: RgbaImageData;
  existingDocument?: ModularSpriteDocument;
}

export interface AppliedSchema {
  schema: ModularSpriteSchema;
  match: SchemaComparisonResult;
  modified: boolean;
}

export interface WizardSchemaState {
  schemas: ModularSpriteSchema[];
  matches: SchemaComparisonResult[];
  applied: AppliedSchema | null;
  matching: boolean;
  progress: { completed: number; total: number };
  autoMatch: boolean;
  addSchema: boolean;
  saveMode: 'new' | 'revision';
  metadata: {
    name: string;
    description: string;
    characterTypeIds: string[];
    characterClassIds: string[];
    tags: string[];
  };
}

export interface WizardSnapshot {
  recipe: ModularSpriteProcessingRecipe;
  grouping: RegionGrouping | null;
  confirmedPartKeys: string[];
  groupingTouched: boolean;
}

export interface WizardState {
  step: ModularSpriteWizardStep;
  status: WizardStatus;
  source: WizardSource | null;
  recipe: ModularSpriteProcessingRecipe;
  processingResult: ProcessedModularSprite | null;
  grouping: RegionGrouping | null;
  groupingTouched: boolean;
  confirmation: { confirmedPartKeys: string[] };
  schema: WizardSchemaState;
  history: WizardSnapshot[];
  future: WizardSnapshot[];
  error: string | null;
  progress: { value: number; stage: string };
  name: string;
  addToCanvas: boolean;
  processingRevision: number;
  existingId: ModularSpriteId | null;
  lastHistory: { at: number; kind: WizardHistoryKind } | null;
}

export type WizardEvent =
  | { type: 'RESET' }
  | { type: 'SOURCE_SELECTED' }
  | { type: 'SOURCE_LOADED'; source: WizardSource; recipe: ModularSpriteProcessingRecipe; name: string; existingId?: ModularSpriteId | null }
  | { type: 'LOAD_FAILED'; message: string }
  | { type: 'PROCESSING_STARTED'; stage?: string }
  | { type: 'PROCESSING_PROGRESS'; value: number; stage: string }
  | { type: 'PROCESSING_SUCCEEDED'; result: ProcessedModularSprite; grouping?: RegionGrouping | null }
  | { type: 'PROCESSING_FAILED'; message: string }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'RECIPE_CHANGED'; recipe: ModularSpriteProcessingRecipe; kind?: WizardHistoryKind; at?: number; process?: boolean }
  | { type: 'REPROCESS_REQUESTED' }
  | { type: 'GROUPING_CHANGED'; grouping: RegionGrouping; kind?: WizardHistoryKind; affectedPartKeys?: string[]; at?: number }
  | { type: 'CONFIRM_PART'; partKey: string }
  | { type: 'SCHEMA_CATALOG_LOADED'; schemas: ModularSpriteSchema[] }
  | { type: 'SCHEMA_MATCHING_STARTED'; total: number }
  | { type: 'SCHEMA_PROGRESS'; completed: number; total: number }
  | { type: 'SCHEMA_MATCHES_RECEIVED'; matches: SchemaComparisonResult[] }
  | { type: 'SCHEMA_MATCHING_FINISHED' }
  | { type: 'SCHEMA_MATCHING_FAILED'; message: string }
  | { type: 'SCHEMA_APPLIED'; schema: ModularSpriteSchema; match: SchemaComparisonResult; grouping: RegionGrouping }
  | { type: 'SET_AUTO_MATCH'; value: boolean }
  | { type: 'SET_SCHEMA_EDITOR'; value: Partial<Pick<WizardSchemaState, 'addSchema' | 'saveMode' | 'metadata'>> }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_ADD_TO_CANVAS'; value: boolean }
  | { type: 'FINALIZATION_STARTED' }
  | { type: 'FINALIZATION_SUCCEEDED' }
  | { type: 'FINALIZATION_FAILED'; message: string }
  | { type: 'UNDO' }
  | { type: 'REDO' };

export function createInitialWizardState(): WizardState {
  return {
    step: 'source',
    status: 'idle',
    source: null,
    recipe: structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE),
    processingResult: null,
    grouping: null,
    groupingTouched: false,
    confirmation: { confirmedPartKeys: [] },
    schema: {
      schemas: [],
      matches: [],
      applied: null,
      matching: false,
      progress: { completed: 0, total: 0 },
      autoMatch: true,
      addSchema: false,
      saveMode: 'new',
      metadata: { name: 'New modular sprite schema', description: '', characterTypeIds: [], characterClassIds: [], tags: [] },
    },
    history: [],
    future: [],
    error: null,
    progress: { value: 0, stage: 'Processing' },
    name: 'Modular Sprite',
    addToCanvas: true,
    processingRevision: 0,
    existingId: null,
    lastHistory: null,
  };
}

function snapshotOf(state: WizardState): WizardSnapshot {
  return {
    recipe: structuredClone(state.recipe),
    grouping: state.grouping ? structuredClone(state.grouping) : null,
    confirmedPartKeys: [...state.confirmation.confirmedPartKeys],
    groupingTouched: state.groupingTouched,
  };
}

function applySnapshot(state: WizardState, snapshot: WizardSnapshot): WizardState {
  return {
    ...state,
    recipe: structuredClone(snapshot.recipe),
    grouping: snapshot.grouping ? structuredClone(snapshot.grouping) : null,
    confirmation: { confirmedPartKeys: [...snapshot.confirmedPartKeys] },
    groupingTouched: snapshot.groupingTouched,
  };
}

function withHistory(state: WizardState, kind: WizardHistoryKind, at = Date.now()): WizardState {
  const coalesce = kind === 'recipe' && state.lastHistory?.kind === 'recipe' && at - state.lastHistory.at < 900;
  return {
    ...state,
    history: coalesce ? state.history : [...state.history.slice(-49), snapshotOf(state)],
    future: [],
    lastHistory: { at, kind },
  };
}

function clearConfirmations(state: WizardState, affectedPartKeys: readonly string[]): string[] {
  if (affectedPartKeys.length === 0) return [...state.confirmation.confirmedPartKeys];
  const affected = new Set(affectedPartKeys);
  return state.confirmation.confirmedPartKeys.filter(partKey => !affected.has(partKey));
}

export function wizardReducer(state: WizardState, event: WizardEvent): WizardState {
  switch (event.type) {
    case 'RESET':
      return createInitialWizardState();
    case 'SOURCE_SELECTED':
      return { ...state, status: 'loading', step: 'source', error: null };
    case 'SOURCE_LOADED':
      return {
        ...state,
        status: 'ready',
        step: 'background',
        source: event.source,
        recipe: structuredClone(event.recipe),
        processingResult: null,
        grouping: null,
        groupingTouched: false,
        confirmation: { confirmedPartKeys: [] },
        history: [],
        future: [],
        error: null,
        name: event.name,
        existingId: event.existingId ?? null,
        lastHistory: null,
        progress: { value: 0, stage: 'Processing' },
        processingRevision: 0,
      };
    case 'LOAD_FAILED':
      return { ...state, status: 'failure', error: event.message };
    case 'PROCESSING_STARTED':
      return { ...state, status: 'processing', error: null, progress: { value: 0, stage: event.stage ?? 'Processing' } };
    case 'PROCESSING_PROGRESS':
      return { ...state, progress: { value: event.value, stage: event.stage } };
    case 'PROCESSING_SUCCEEDED':
      return { ...state, status: 'ready', processingResult: event.result, ...(event.grouping !== undefined ? { grouping: event.grouping } : {}), error: null, progress: { value: 1, stage: 'Done' } };
    case 'PROCESSING_FAILED':
      return { ...state, status: 'failure', error: event.message };
    case 'NEXT': {
      if (!canContinue(state)) return state;
      const next = nextWizardStep(state.step);
      return next ? { ...state, step: next, error: null } : state;
    }
    case 'BACK': {
      const previous = previousWizardStep(state.step);
      return previous ? { ...state, step: previous, error: null } : state;
    }
    case 'RECIPE_CHANGED': {
      const next = withHistory(state, event.kind ?? 'recipe', event.at);
      return { ...next, recipe: structuredClone(event.recipe), processingRevision: event.process === false ? state.processingRevision : state.processingRevision + 1, error: null };
    }
    case 'REPROCESS_REQUESTED':
      return { ...state, processingRevision: state.processingRevision + 1 };
    case 'GROUPING_CHANGED': {
      const next = withHistory(state, event.kind ?? 'parts', event.at);
      return {
        ...next,
        grouping: structuredClone(event.grouping),
        groupingTouched: true,
        confirmation: { confirmedPartKeys: clearConfirmations(next, event.affectedPartKeys ?? []) },
        schema: next.schema.applied ? { ...next.schema, applied: { ...next.schema.applied, modified: true } } : next.schema,
        error: null,
      };
    }
    case 'CONFIRM_PART':
      return state.grouping?.parts.some(part => part.partKey === event.partKey)
        ? { ...state, confirmation: { confirmedPartKeys: [...new Set([...state.confirmation.confirmedPartKeys, event.partKey])] }, error: null }
        : state;
    case 'SCHEMA_CATALOG_LOADED':
      return { ...state, schema: { ...state.schema, schemas: structuredClone(event.schemas) } };
    case 'SCHEMA_MATCHING_STARTED':
      return { ...state, schema: { ...state.schema, matching: true, progress: { completed: 0, total: event.total } } };
    case 'SCHEMA_PROGRESS':
      return { ...state, schema: { ...state.schema, progress: { completed: event.completed, total: event.total } } };
    case 'SCHEMA_MATCHES_RECEIVED':
      return { ...state, schema: { ...state.schema, matches: structuredClone(event.matches) } };
    case 'SCHEMA_MATCHING_FINISHED':
      return { ...state, schema: { ...state.schema, matching: false } };
    case 'SCHEMA_MATCHING_FAILED':
      return { ...state, schema: { ...state.schema, matching: false }, error: event.message };
    case 'SCHEMA_APPLIED':
      return { ...state, grouping: structuredClone(event.grouping), groupingTouched: false, confirmation: { confirmedPartKeys: event.grouping.parts.map(part => part.partKey) }, schema: { ...state.schema, applied: { schema: structuredClone(event.schema), match: structuredClone(event.match), modified: false } }, error: null };
    case 'SET_AUTO_MATCH':
      return { ...state, schema: { ...state.schema, autoMatch: event.value } };
    case 'SET_SCHEMA_EDITOR':
      return { ...state, schema: { ...state.schema, ...event.value, ...(event.value.metadata ? { metadata: structuredClone(event.value.metadata) } : {}) } };
    case 'SET_NAME':
      return { ...state, name: event.name };
    case 'SET_ADD_TO_CANVAS':
      return { ...state, addToCanvas: event.value };
    case 'FINALIZATION_STARTED':
      return { ...state, status: 'finalizing', error: null, progress: { value: 0, stage: 'Extracting parts' } };
    case 'FINALIZATION_SUCCEEDED':
      return { ...state, status: 'success', error: null };
    case 'FINALIZATION_FAILED':
      return { ...state, status: 'failure', error: event.message };
    case 'UNDO': {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return applySnapshot({ ...state, history: state.history.slice(0, -1), future: [snapshotOf(state), ...state.future].slice(0, 50), lastHistory: null, processingRevision: state.processingRevision + 1 }, previous);
    }
    case 'REDO': {
      const next = state.future[0];
      if (!next) return state;
      return applySnapshot({ ...state, history: [...state.history.slice(-49), snapshotOf(state)], future: state.future.slice(1), lastHistory: null, processingRevision: state.processingRevision + 1 }, next);
    }
    default:
      return state;
  }
}

export function canContinue(state: WizardState): boolean {
  if (state.status === 'loading' || state.status === 'processing' || state.status === 'finalizing') return false;
  if (state.step === 'background') return Boolean(state.processingResult);
  if (state.step === 'regions') return Boolean(state.grouping?.parts.length);
  if (state.step === 'parts') return Boolean(state.grouping?.parts.length) && state.grouping!.parts.every(part => part.regionIds.length > 0 && state.confirmation.confirmedPartKeys.includes(part.partKey));
  return false;
}

function nextWizardStep(step: ModularSpriteWizardStep): ModularSpriteWizardStep | null {
  const steps: ModularSpriteWizardStep[] = ['source', 'background', 'regions', 'parts', 'review'];
  return steps[steps.indexOf(step) + 1] ?? null;
}

function previousWizardStep(step: ModularSpriteWizardStep): ModularSpriteWizardStep | null {
  const steps: ModularSpriteWizardStep[] = ['source', 'background', 'regions', 'parts', 'review'];
  return steps[steps.indexOf(step) - 1] ?? null;
}

export function isWizardBusy(state: WizardState): boolean {
  return state.status === 'loading' || state.status === 'processing' || state.status === 'finalizing';
}

export function hasUnsavedChanges(state: WizardState): boolean {
  return Boolean(state.source) || state.history.length > 0 || state.status === 'failure';
}
