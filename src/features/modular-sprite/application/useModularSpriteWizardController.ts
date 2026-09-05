import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import type { ModularSpriteDocument, ModularSpriteId, ModularSpriteMaskStrokeKind, ModularSpriteProcessingRecipe, NormalizedPoint } from '@kukla2d/contracts';
import type { MatchProgressEvent, ModularSpriteSchema, SchemaComparisonResult, SchemaMatchRequest, SchemaMatchResponse, SemanticCatalog } from '@kukla2d/modular-sprite-schema';

import { finalizeModularSpriteImport, type ModularSpriteProcessingPort, type ModularSpriteSchemaPort } from './finalizeModularSpriteImport.js';
import { createDraftPart, slugPartKey } from './partDraftFactory.js';
import { groupingFromSchemaMatch } from './schemaBinding.js';
import {
  canContinue,
  createInitialWizardState,
  hasUnsavedChanges,
  isWizardBusy,
  wizardReducer,
  type WizardState,
} from './wizardState.js';
import { matchRegionsToTemplate } from '../domain/matching.js';
import { createInitialGrouping, createPartFromRegions, excludeRegions, moveRegionsToPart, removePart, renamePart, type RegionGrouping } from '../domain/partGrouping.js';
import { analyzeModularSpriteBackground } from '../domain/processor.js';
import { reconcileRegionGrouping } from '../domain/regionReconciliation.js';

import type { ModularSpriteCommitRequest } from './importContracts.js';
import type { DetectedRegion, ModularSpriteDraftPart, ProcessedModularSprite, RgbaImageData } from '../domain/contracts.js';

export interface ModularSpriteProcessingControllerPort extends ModularSpriteProcessingPort {
  warm(image: RgbaImageData): Promise<void>;
  onProgress?(listener: (progress: { progress: number; stage: string }) => void): () => void;
  cancel(): void;
  dispose(): void;
}

export interface ModularSpriteImageControllerPort {
  decode(file: File): Promise<RgbaImageData>;
  preview(image: RgbaImageData): RgbaImageData;
  encode(image: RgbaImageData): Promise<Blob>;
}

export interface ModularSpriteSchemaControllerPort extends ModularSpriteSchemaPort {
  initialize(): Promise<void>;
  list(): ModularSpriteSchema[];
  match(request: SchemaMatchRequest, options?: { signal?: AbortSignal; onProgress?: (event: MatchProgressEvent) => void }): Promise<SchemaMatchResponse>;
  semantics?: SemanticCatalog;
}

export interface ModularSpriteExistingSource {
  file: File;
  document: ModularSpriteDocument;
}

export interface ModularSpriteWizardControllerPorts {
  image: ModularSpriteImageControllerPort;
  processing: ModularSpriteProcessingControllerPort;
  schema: ModularSpriteSchemaControllerPort;
  resolveExisting?: (id: ModularSpriteId) => Promise<ModularSpriteExistingSource>;
}

export interface ModularSpriteWizardControllerProps {
  open: boolean;
  existingId?: ModularSpriteId | null;
  onOpenChange: (open: boolean) => void;
  onCommit: (request: ModularSpriteCommitRequest) => Promise<unknown>;
  ports: ModularSpriteWizardControllerPorts;
  confirmDiscard?: () => boolean;
}

export type PreviewMode = 'original' | 'matte' | 'result';
export type EditorTool = 'select' | 'eyedropper' | ModularSpriteMaskStrokeKind;

const PART_COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#fb7185', '#4ade80', '#fb923c', '#2dd4bf', '#e879f9'];

export interface RegionAssignment {
  color: string;
  name: string;
}

export interface ModularSpriteWizardController {
  state: WizardState;
  resultRef: React.RefObject<ProcessedModularSprite | null>;
  resultVersion: number;
  ui: {
    previewMode: PreviewMode;
    setPreviewMode: (mode: PreviewMode) => void;
    tool: EditorTool;
    setTool: (tool: EditorTool) => void;
    brushRadius: number;
    setBrushRadius: (radius: number) => void;
    zoom: number;
    setZoom: (zoom: number) => void;
    showOverlays: boolean;
    setShowOverlays: (value: boolean) => void;
    advancedFrameKeys: ReadonlySet<string>;
    toggleAdvancedFrame: (partKey: string) => void;
    selectedRegionIds: ReadonlySet<number>;
    assignmentPartKey: string;
  };
  assignments: ReadonlyMap<number, RegionAssignment>;
  busy: boolean;
  canGoNext: boolean;
  loadFile: (file: File, existingDocument?: ModularSpriteDocument) => Promise<void>;
  changeRecipe: (change: (recipe: ModularSpriteProcessingRecipe) => void, kind?: 'recipe' | 'discrete' | 'parts', process?: boolean) => void;
  commitRecipeProcessing: () => void;
  updatePart: (index: number, change: Partial<ModularSpriteDraftPart>) => void;
  updateExtractionFrame: (index: number, field: 'x' | 'y' | 'width' | 'height', value: number) => void;
  removePart: (index: number) => void;
  mergeSelected: () => void;
  excludeSelected: () => void;
  assignSelected: () => void;
  toggleRegionSelection: (regionId: number, additive: boolean) => void;
  setAssignmentPartKey: (partKey: string) => void;
  confirmPart: (partKey: string) => void;
  undo: () => void;
  redo: () => void;
  applySchemaMatch: (match: SchemaComparisonResult) => void;
  setAutoMatch: (value: boolean) => void;
  setSchemaEditor: (value: Partial<Pick<WizardState['schema'], 'addSchema' | 'saveMode' | 'metadata'>>) => void;
  setName: (name: string) => void;
  setAddToCanvas: (value: boolean) => void;
  next: () => void;
  back: () => void;
  finalize: () => Promise<void>;
  reset: () => void;
  requestClose: () => boolean;
}

function nearestRegionId(point: NormalizedPoint, regions: readonly DetectedRegion[], used: Set<number>): number | null {
  let best: DetectedRegion | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const region of regions) {
    if (used.has(region.id)) continue;
    const distance = Math.hypot(point.x - region.centroid.x, point.y - region.centroid.y);
    if (distance < bestDistance) {
      best = region;
      bestDistance = distance;
    }
  }
  if (!best || bestDistance > 0.2) return null;
  used.add(best.id);
  return best.id;
}

function existingGrouping(document: ModularSpriteDocument, result: ProcessedModularSprite): RegionGrouping {
  const used = new Set<number>();
  const fallback = matchRegionsToTemplate(document.parts.map(part => ({ partKey: part.partKey, required: part.required, contentBounds: part.contentBounds })), result.regions);
  const parts = document.parts.map(part => {
    const ids = part.componentSeeds
      .map(seed => nearestRegionId(seed, result.regions, used))
      .filter((regionId): regionId is number => regionId !== null);
    if (ids.length === 0) {
      const match = fallback.find(candidate => candidate.partKey === part.partKey);
      if (match && match.confidence >= 0.55 && match.regionId !== null && !used.has(match.regionId)) {
        used.add(match.regionId);
        ids.push(match.regionId);
      }
    }
    return { ...structuredClone(part), regionIds: [...new Set(ids)] };
  });
  return { parts, excludedRegionIds: result.regions.map(region => region.id).filter(regionId => !used.has(regionId)) };
}

function partFactoryFor(result: ProcessedModularSprite | null) {
  return (region: DetectedRegion, index: number, parts: readonly ModularSpriteDraftPart[]) => createDraftPart(region, result?.width ?? 1, result?.height ?? 1, index, parts);
}

function colorForPart(parts: readonly ModularSpriteDraftPart[], partKey: string): string {
  const index = parts.findIndex(part => part.partKey === partKey);
  return PART_COLORS[(index < 0 ? 0 : index) % PART_COLORS.length]!;
}

export function useModularSpriteWizardController({ open, existingId = null, onOpenChange, onCommit, ports, confirmDiscard }: ModularSpriteWizardControllerProps): ModularSpriteWizardController {
  const [state, dispatch] = useReducer(wizardReducer, undefined, createInitialWizardState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const resultRef = useRef<ProcessedModularSprite | null>(null);
  const processGeneration = useRef(0);
  const loadedExistingId = useRef<string | null>(null);
  const lastAutoApplied = useRef('');
  const [resultVersion, setResultVersion] = useState(0);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('result');
  const [tool, setTool] = useState<EditorTool>('select');
  const [brushRadius, setBrushRadius] = useState(0.012);
  const [zoom, setZoom] = useState(1);
  const [showOverlays, setShowOverlays] = useState(true);
  const [advancedFrameKeys, setAdvancedFrameKeys] = useState<Set<string>>(new Set());
  const [selectedRegionIds, setSelectedRegionIds] = useState<Set<number>>(new Set());
  const [assignmentPartKey, setAssignmentPartKeyState] = useState('');

  useEffect(() => ports.processing.onProgress?.(update => dispatch({ type: 'PROCESSING_PROGRESS', value: update.progress, stage: update.stage })), [ports.processing]);

  const reset = useCallback(() => {
    processGeneration.current += 1;
    ports.processing.cancel();
    resultRef.current = null;
    setResultVersion(version => version + 1);
    setSelectedRegionIds(new Set());
    setAssignmentPartKeyState('');
    setAdvancedFrameKeys(new Set());
    setPreviewMode('result');
    setTool('select');
    setZoom(1);
    dispatch({ type: 'RESET' });
  }, [ports.processing]);

  useEffect(() => () => {
    processGeneration.current += 1;
    ports.processing.dispose();
  }, [ports.processing]);

  const loadFile = useCallback(async (nextFile: File, existingDocument?: ModularSpriteDocument): Promise<void> => {
    dispatch({ type: 'SOURCE_SELECTED' });
    try {
      const decoded = await ports.image.decode(nextFile);
      const preview = ports.image.preview(decoded);
      const detected = analyzeModularSpriteBackground(preview);
      const recipe = existingDocument?.recipe ?? {
        ...structuredClone(stateRef.current.recipe),
        background: { ...stateRef.current.recipe.background, mode: detected.mode, color: detected.color },
      };
      await ports.processing.warm(preview);
      const source = { file: nextFile, image: decoded, preview, ...(existingDocument ? { existingDocument } : {}) };
      dispatch({ type: 'SOURCE_LOADED', source, recipe, name: existingDocument?.name ?? (nextFile.name.replace(/\.[^.]+$/, '') || 'Modular Sprite'), ...(existingDocument ? { existingId: existingDocument.id } : {}) });
    } catch (loadError) {
      dispatch({ type: 'LOAD_FAILED', message: loadError instanceof Error ? loadError.message : 'Could not decode the image' });
    }
  }, [ports.image, ports.processing]);

  useEffect(() => {
    if (!open || !existingId || loadedExistingId.current === existingId || !ports.resolveExisting) return;
    loadedExistingId.current = existingId;
    void ports.resolveExisting(existingId).then(existing => loadFile(existing.file, existing.document)).catch(error => dispatch({ type: 'LOAD_FAILED', message: error instanceof Error ? error.message : 'Could not open the source image' }));
  }, [existingId, loadFile, open, ports.resolveExisting]);

  useEffect(() => {
    if (!open || existingId) return;
    loadedExistingId.current = null;
  }, [existingId, open]);

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    void ports.schema.initialize()
      .then(() => { if (!ignore) dispatch({ type: 'SCHEMA_CATALOG_LOADED', schemas: ports.schema.list() }); })
      .catch(error => { if (!ignore) dispatch({ type: 'SCHEMA_MATCHING_FAILED', message: error instanceof Error ? error.message : 'Could not load schema catalog' }); });
    return () => { ignore = true; };
  }, [open, ports.schema]);

  useEffect(() => {
    const source = state.source;
    if (!open || !source) return;
    const generation = ++processGeneration.current;
    const timeout = window.setTimeout(() => {
      dispatch({ type: 'PROCESSING_STARTED' });
      const recipe = structuredClone(stateRef.current.recipe);
      const run = ports.processing.process({ recipe })
        .catch(error => {
          if (error instanceof Error && error.message.includes('not warmed up')) return ports.processing.process({ image: source.preview, recipe });
          throw error;
        });
      void run.then(nextResult => {
        if (generation !== processGeneration.current) return;
        const current = stateRef.current;
        const previousResult = current.processingResult;
        let grouping: RegionGrouping;
        if (!current.grouping) {
          grouping = source.existingDocument ? existingGrouping(source.existingDocument, nextResult) : createInitialGrouping(nextResult, partFactoryFor(nextResult));
        } else if (previousResult) {
          grouping = reconcileRegionGrouping(current.grouping, previousResult.regions, nextResult.regions).grouping;
        } else {
          grouping = structuredClone(current.grouping);
        }
        resultRef.current = nextResult;
        setResultVersion(version => version + 1);
        dispatch({ type: 'PROCESSING_SUCCEEDED', result: nextResult, grouping });
      }).catch(error => {
        if (generation !== processGeneration.current || (error instanceof DOMException && error.name === 'AbortError')) return;
        dispatch({ type: 'PROCESSING_FAILED', message: error instanceof Error ? error.message : 'Image processing failed' });
      });
    }, 60);
    return () => {
      window.clearTimeout(timeout);
      ports.processing.cancel();
    };
  }, [open, ports.processing, state.processingRevision, state.source]);

  useEffect(() => {
    const result = state.processingResult;
    if (!open || !state.schema.autoMatch || !result || state.schema.schemas.length === 0) return;
    const controller = new AbortController();
    let ignore = false;
    dispatch({ type: 'SCHEMA_MATCHING_STARTED', total: state.schema.schemas.length });
    const requestId = crypto.randomUUID();
    void ports.schema.match({ requestId, observation: result.observation, matcherProfileId: 'default-v1' }, {
      signal: controller.signal,
      onProgress: event => { if (!ignore) dispatch({ type: 'SCHEMA_PROGRESS', completed: event.completed, total: event.total }); },
    }).then(response => {
      if (ignore) return;
      dispatch({ type: 'SCHEMA_MATCHES_RECEIVED', matches: response.matches });
      const best = response.matches[0];
      const autoKey = `${resultVersion}:${best?.schemaId ?? ''}`;
      if (best?.confidence === 'high' && !stateRef.current.groupingTouched && lastAutoApplied.current !== autoKey) {
        lastAutoApplied.current = autoKey;
        const schema = stateRef.current.schema.schemas.find(item => item.schemaId === best.schemaId && item.revision === best.schemaRevision);
        if (schema) {
          const grouping = groupingFromSchemaMatch(result, schema, best, (region, index, parts) => createDraftPart(region, result.width, result.height, index, parts), ports.schema.semantics);
          dispatch({ type: 'SCHEMA_APPLIED', schema, match: best, grouping });
        }
      }
    }).catch(error => {
      if (!ignore && !(error instanceof DOMException && error.name === 'AbortError')) dispatch({ type: 'SCHEMA_MATCHING_FAILED', message: error instanceof Error ? error.message : 'Schema matching failed' });
    }).finally(() => { if (!ignore) dispatch({ type: 'SCHEMA_MATCHING_FINISHED' }); });
    return () => { ignore = true; controller.abort(); };
  }, [open, ports.schema, resultVersion, state.processingResult, state.schema.autoMatch, state.schema.schemas]);

  const changeRecipe = useCallback((change: (recipe: ModularSpriteProcessingRecipe) => void, kind: 'recipe' | 'discrete' | 'parts' = 'recipe', process = true): void => {
    const recipe = structuredClone(stateRef.current.recipe);
    change(recipe);
    dispatch({ type: 'RECIPE_CHANGED', recipe, kind, process });
  }, []);

  const commitRecipeProcessing = useCallback(() => dispatch({ type: 'REPROCESS_REQUESTED' }), []);

  const updatePart = useCallback((index: number, change: Partial<ModularSpriteDraftPart>): void => {
    const grouping = stateRef.current.grouping;
    const current = grouping?.parts[index];
    if (!grouping || !current) return;
    const next = change.name !== undefined ? renamePart(grouping, current.partKey, change.name).grouping : structuredClone(grouping);
    const target = next.parts[index];
    if (!target) return;
    const otherChanges: Partial<ModularSpriteDraftPart> = { ...change };
    delete otherChanges.name;
    Object.assign(target, structuredClone(otherChanges));
    dispatch({ type: 'GROUPING_CHANGED', grouping: next, affectedPartKeys: [current.partKey, ...(change.partKey ? [change.partKey] : [])] });
  }, []);

  const updateExtractionFrame = useCallback((index: number, field: 'x' | 'y' | 'width' | 'height', value: number): void => {
    const grouping = stateRef.current.grouping;
    const part = grouping?.parts[index];
    if (!grouping || !part || !Number.isFinite(value)) return;
    const frame = { ...part.extractionFrame };
    if (field === 'x') frame.x = Math.min(1 - frame.width, Math.max(0, value));
    if (field === 'y') frame.y = Math.min(1 - frame.height, Math.max(0, value));
    if (field === 'width') frame.width = Math.min(1 - frame.x, Math.max(0.001, value));
    if (field === 'height') frame.height = Math.min(1 - frame.y, Math.max(0.001, value));
    updatePart(index, { extractionFrame: frame });
  }, [updatePart]);

  const updateGrouping = useCallback((next: RegionGrouping, affectedPartKeys: readonly string[] = []): void => {
    dispatch({ type: 'GROUPING_CHANGED', grouping: next, affectedPartKeys: [...affectedPartKeys] });
  }, []);

  const removePartCommand = useCallback((index: number): void => {
    const grouping = stateRef.current.grouping;
    const part = grouping?.parts[index];
    if (!grouping || !part) return;
    const changed = removePart(grouping, part.partKey);
    updateGrouping(changed.grouping, changed.affectedPartKeys);
  }, [updateGrouping]);

  const mergeSelected = useCallback((): void => {
    const grouping = stateRef.current.grouping;
    const result = stateRef.current.processingResult;
    const ids = [...selectedRegionIds];
    if (!grouping || !result || ids.length < 2) return;
    const changed = createPartFromRegions(grouping, result.regions, ids, partFactoryFor(result), { width: result.width, height: result.height });
    updateGrouping(changed.grouping, changed.affectedPartKeys);
    setSelectedRegionIds(new Set());
    setAssignmentPartKeyState('');
  }, [selectedRegionIds, updateGrouping]);

  const excludeSelected = useCallback((): void => {
    const grouping = stateRef.current.grouping;
    const ids = [...selectedRegionIds];
    if (!grouping || ids.length === 0) return;
    const changed = excludeRegions(grouping, ids);
    updateGrouping(changed.grouping, changed.affectedPartKeys);
    setSelectedRegionIds(new Set());
  }, [selectedRegionIds, updateGrouping]);

  const assignSelected = useCallback((): void => {
    const grouping = stateRef.current.grouping;
    const ids = [...selectedRegionIds];
    if (!grouping || ids.length === 0 || !assignmentPartKey) return;
    const changed = moveRegionsToPart(grouping, ids, assignmentPartKey);
    updateGrouping(changed.grouping, changed.affectedPartKeys);
    setSelectedRegionIds(new Set());
  }, [assignmentPartKey, selectedRegionIds, updateGrouping]);

  const toggleRegionSelection = useCallback((regionId: number, additive: boolean): void => {
    setSelectedRegionIds(previous => {
      if (!regionId) return additive ? previous : new Set();
      const next = additive ? new Set(previous) : new Set<number>();
      if (next.has(regionId)) next.delete(regionId); else next.add(regionId);
      return next;
    });
  }, []);

  const applySchemaMatch = useCallback((match: SchemaComparisonResult): void => {
    const result = stateRef.current.processingResult;
    const schema = stateRef.current.schema.schemas.find(item => item.schemaId === match.schemaId && item.revision === match.schemaRevision);
    if (!result || !schema) return;
    const grouping = groupingFromSchemaMatch(result, schema, match, (region, index, parts) => createDraftPart(region, result.width, result.height, index, parts), ports.schema.semantics);
    dispatch({ type: 'SCHEMA_APPLIED', schema, match, grouping });
  }, [ports.schema.semantics]);

  const assignments = useMemo(() => {
    const map = new Map<number, RegionAssignment>();
    for (const part of state.grouping?.parts ?? []) for (const regionId of part.regionIds) map.set(regionId, { color: colorForPart(state.grouping?.parts ?? [], part.partKey), name: part.name });
    return map;
  }, [state.grouping]);

  const finalize = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (!current.source || !current.processingResult || !current.grouping) return;
    dispatch({ type: 'FINALIZATION_STARTED' });
    try {
      const outcome = await finalizeModularSpriteImport({
        existingId: current.existingId,
        source: current.source,
        recipe: current.recipe,
        previewResult: current.processingResult,
        grouping: current.grouping,
        confirmedPartKeys: current.confirmation.confirmedPartKeys,
        name: current.name,
        addToCanvas: current.addToCanvas,
        schema: {
          applied: current.schema.applied,
          addSchema: current.schema.addSchema,
          saveMode: current.schema.saveMode,
          metadata: current.schema.metadata,
        },
      }, { processing: ports.processing, image: ports.image, schema: ports.schema });
      await onCommit(outcome.request);
      if (outcome.schema) dispatch({ type: 'SCHEMA_CATALOG_LOADED', schemas: ports.schema.list() });
      dispatch({ type: 'FINALIZATION_SUCCEEDED' });
      reset();
      onOpenChange(false);
    } catch (error) {
      dispatch({ type: 'FINALIZATION_FAILED', message: error instanceof Error ? error.message : 'Could not import the modular sprite' });
    }
  }, [onCommit, onOpenChange, ports.image, ports.processing, ports.schema, reset]);

  const requestClose = useCallback((): boolean => {
    if (hasUnsavedChanges(stateRef.current) && !(confirmDiscard?.() ?? true)) return false;
    reset();
    loadedExistingId.current = null;
    onOpenChange(false);
    return true;
  }, [confirmDiscard, onOpenChange, reset]);

  const toggleAdvancedFrame = useCallback((partKey: string): void => {
    setAdvancedFrameKeys(previous => {
      const next = new Set(previous);
      if (next.has(partKey)) next.delete(partKey); else next.add(partKey);
      return next;
    });
  }, []);

  const setAssignmentPartKey = useCallback((partKey: string): void => setAssignmentPartKeyState(partKey), []);
  const confirmPart = useCallback((partKey: string): void => dispatch({ type: 'CONFIRM_PART', partKey }), []);
  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);
  const setAutoMatch = useCallback((value: boolean) => dispatch({ type: 'SET_AUTO_MATCH', value }), []);
  const setSchemaEditor = useCallback((value: Partial<Pick<WizardState['schema'], 'addSchema' | 'saveMode' | 'metadata'>>) => dispatch({ type: 'SET_SCHEMA_EDITOR', value }), []);
  const setName = useCallback((name: string) => dispatch({ type: 'SET_NAME', name }), []);
  const setAddToCanvas = useCallback((value: boolean) => dispatch({ type: 'SET_ADD_TO_CANVAS', value }), []);
  const next = useCallback(() => dispatch({ type: 'NEXT' }), []);
  const back = useCallback(() => dispatch({ type: 'BACK' }), []);

  return {
    state,
    resultRef,
    resultVersion,
    ui: { previewMode, setPreviewMode, tool, setTool, brushRadius, setBrushRadius, zoom, setZoom, showOverlays, setShowOverlays, advancedFrameKeys, toggleAdvancedFrame, selectedRegionIds, assignmentPartKey },
    assignments,
    busy: isWizardBusy(state),
    canGoNext: canContinue(state),
    loadFile,
    changeRecipe,
    commitRecipeProcessing,
    updatePart,
    updateExtractionFrame,
    removePart: removePartCommand,
    mergeSelected,
    excludeSelected,
    assignSelected,
    toggleRegionSelection,
    setAssignmentPartKey,
    confirmPart,
    undo,
    redo,
    applySchemaMatch,
    setAutoMatch,
    setSchemaEditor,
    setName,
    setAddToCanvas,
    next,
    back,
    finalize,
    reset,
    requestClose,
  };
}

export { slugPartKey };
