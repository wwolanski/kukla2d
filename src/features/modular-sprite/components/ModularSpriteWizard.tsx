import { useMachine } from '@xstate/react';
import { Check, Eraser, Loader2, Merge, MousePointer2, Paintbrush, Redo2, Scissors, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  ModularSpriteDocument,
  ModularSpriteId,
  ModularSpriteMaskStrokeKind,
  ModularSpriteProcessingRecipe,
  NormalizedPoint,
} from '@kukla2d/contracts';
import { semanticRoleIdForLegacyRole, type ModularSpriteSchema, type SchemaComparisonResult } from '@kukla2d/modular-sprite-schema';

import { useProjectStore } from '@/store/projectStore';

import { createUserSchema, localSchemaApi, portableSnapshot, schemaCatalog, type NewSchemaMetadata } from '@/features/modular-sprite-schema';
import { SchemaComparisonSidebar } from '@/features/modular-sprite-schema/components/SchemaComparisonSidebar';
import { SchemaEditor } from '@/features/modular-sprite-schema/components/SchemaEditor';
import { SemanticRolePicker } from '@/features/modular-sprite-schema/components/SemanticRolePicker';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

import { ModularSpritePreviewCanvas, type RegionAssignment } from './ModularSpritePreviewCanvas.js';
import { modularSpriteWizardMachine, type ModularSpriteWizardStep } from '../application/modularSpriteWizardMachine.js';
import {
  DEFAULT_MODULAR_SPRITE_RECIPE,
  type DetectedRegion,
  type ModularSpriteDraftPart,
  type ProcessedModularSprite,
  type RgbaImageData,
} from '../domain/contracts.js';
import { matchRegionsToTemplate } from '../domain/matching.js';
import { analyzeModularSpriteBackground, createDefaultExtractionFrame } from '../domain/processor.js';
import { createPreviewImage, decodeModularSpriteFile, encodeRgbaPng } from '../infrastructure/imageCodec.js';
import { createModularSpriteWorkerClient } from '../infrastructure/modularSpriteWorkerClient.js';

import type { ModularSpriteCommitRequest } from '../application/importContracts.js';

const UiButton = Button as React.ComponentType<React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string;
  size?: string;
}>;
const UiInput = Input as React.ComponentType<React.InputHTMLAttributes<HTMLInputElement>>;
const UiSlider = Slider as React.ComponentType<{
  min?: number;
  max?: number;
  step?: number;
  value: number[];
  onValueChange: (value: number[]) => void;
  onValueCommit?: (value: number[]) => void;
}>;
const UiSwitch = Switch as React.ComponentType<{
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
}>;
const UiDialog = Dialog as React.ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }>;
const UiDialogContent = DialogContent as React.ComponentType<{ className?: string; children: React.ReactNode }>;
const UiDialogDescription = DialogDescription as React.ComponentType<{ children: React.ReactNode }>;
const UiDialogHeader = DialogHeader as React.ComponentType<{ className?: string; children: React.ReactNode }>;
const UiDialogTitle = DialogTitle as React.ComponentType<{ children: React.ReactNode }>;

const STEPS: ModularSpriteWizardStep[] = ['source', 'background', 'regions', 'parts', 'review'];
const STEP_LABELS: Record<ModularSpriteWizardStep, string> = {
  source: 'Source',
  background: 'Background & cleanup',
  regions: 'Group regions',
  parts: 'Part details',
  review: 'Review',
};
const PART_COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#fb7185', '#4ade80', '#fb923c', '#2dd4bf', '#e879f9'];
const RECIPE_HISTORY_COALESCE_MS = 900;
const PROCESS_DEBOUNCE_MS = 60;

interface ModularSpriteWizardProps {
  open: boolean;
  existingId?: ModularSpriteId | null;
  onOpenChange: (open: boolean) => void;
  onCommit: (request: ModularSpriteCommitRequest) => Promise<unknown>;
}

interface EditorSnapshot {
  recipe: ModularSpriteProcessingRecipe;
  parts: ModularSpriteDraftPart[];
  confirmedKeys: string[];
}

type PreviewMode = 'original' | 'matte' | 'result';
type EditorTool = 'select' | 'eyedropper' | ModularSpriteMaskStrokeKind;
type HistoryKind = 'recipe' | 'discrete' | 'parts';

function slug(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'part';
}

function parseQualifiers(value: string): Record<string, string> {
  const qualifiers: Record<string, string> = {};
  for (const entry of value.split(',')) {
    const [rawKey, ...rawValue] = entry.split('=');
    const key = rawKey?.trim() ?? ''; const itemValue = rawValue.join('=').trim();
    if (key && itemValue) qualifiers[key] = itemValue;
  }
  return qualifiers;
}

function uniqueKey(base: string, parts: ModularSpriteDraftPart[]): string {
  const taken = new Set(parts.map(part => part.partKey));
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function colorToHex(color: { r: number; g: number; b: number }): string {
  return `#${[color.r, color.g, color.b].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function hexToColor(value: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

function partColor(parts: ModularSpriteDraftPart[], partKey: string): string {
  const index = parts.findIndex(part => part.partKey === partKey);
  return PART_COLORS[(index < 0 ? 0 : index) % PART_COLORS.length]!;
}

function createPart(region: DetectedRegion, sourceWidth: number, sourceHeight: number, index: number, existingParts: ModularSpriteDraftPart[]): ModularSpriteDraftPart {
  const suggested = region.suggestedRole || 'custom';
  const semanticRoleId = semanticRoleIdForLegacyRole(suggested);
  const name = suggested === 'custom' ? `Part ${index + 1}` : suggested.replaceAll('-', ' ');
  return {
    partKey: uniqueKey(slug(name), existingParts),
    name,
    role: suggested,
    ...(semanticRoleId ? { semanticRoleId } : {}),
    side: 'none',
    qualifiers: {},
    required: true,
    order: index,
    extractionFrame: createDefaultExtractionFrame(region, sourceWidth, sourceHeight),
    contentBounds: region.normalizedBounds,
    regionIds: [region.id],
  };
}

function nearestRegionId(point: NormalizedPoint, regions: DetectedRegion[], used: Set<number>): number | null {
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

function existingDrafts(document: ModularSpriteDocument, result: ProcessedModularSprite): ModularSpriteDraftPart[] {
  const matches = matchRegionsToTemplate(document.parts.map(part => ({
    partKey: part.partKey,
    required: part.required,
    contentBounds: part.contentBounds,
  })), result.regions);
  return document.parts.map(part => {
    const match = matches.find(candidate => candidate.partKey === part.partKey);
    const regionId = match && match.confidence >= 0.55 ? match.regionId : null;
    return { ...structuredClone(part), regionIds: regionId ? [regionId] : [] };
  });
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="grid gap-1 text-xs text-muted-foreground">{children}</label>;
}

function PartThumbnail({
  resultRef,
  resultVersion,
  regionIds,
  maxSize = 96,
}: {
  resultRef: React.RefObject<ProcessedModularSprite | null>;
  resultVersion: number;
  regionIds: number[];
  maxSize?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const result = resultRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    const selected = new Set(regionIds);
    const selectedRegions = result.regions.filter(region => selected.has(region.id));
    if (selectedRegions.length === 0) {
      canvas.width = 1;
      canvas.height = 1;
      return;
    }
    const minX = Math.min(...selectedRegions.map(region => region.bounds.x));
    const minY = Math.min(...selectedRegions.map(region => region.bounds.y));
    const maxX = Math.max(...selectedRegions.map(region => region.bounds.x + region.bounds.width - 1));
    const maxY = Math.max(...selectedRegions.map(region => region.bounds.y + region.bounds.height - 1));
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    const output = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourcePixel = (y + minY) * result.width + (x + minX);
        if (!selected.has(result.labels[sourcePixel] ?? 0)) continue;
        const sourceOffset = sourcePixel * 4;
        const outputOffset = (y * width + x) * 4;
        output[outputOffset] = result.rgba[sourceOffset] ?? 0;
        output[outputOffset + 1] = result.rgba[sourceOffset + 1] ?? 0;
        output[outputOffset + 2] = result.rgba[sourceOffset + 2] ?? 0;
        output[outputOffset + 3] = result.matte[sourcePixel] ?? 0;
      }
    }
    context.putImageData(new ImageData(output, width, height), 0, 0);
    const scale = Math.min(1, maxSize / Math.max(width, height));
    canvas.style.width = `${Math.round(width * scale)}px`;
    canvas.style.height = `${Math.round(height * scale)}px`;
  }, [maxSize, regionIds, resultRef, resultVersion]);

  return <canvas ref={canvasRef} aria-hidden className="shrink-0 rounded border bg-[linear-gradient(45deg,#222_25%,transparent_25%),linear-gradient(-45deg,#222_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#222_75%),linear-gradient(-45deg,transparent_75%,#222_75%)] bg-[length:16px_16px]" />;
}

export function ModularSpriteWizard({ open, existingId, onOpenChange, onCommit }: ModularSpriteWizardProps): React.ReactElement {
  const [machine, send] = useMachine(modularSpriteWizardMachine);
  const project = useProjectStore(state => state.project);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<RgbaImageData | null>(null);
  const [previewSource, setPreviewSource] = useState<RgbaImageData | null>(null);
  const [result, setResult] = useState<ProcessedModularSprite | null>(null);
  const resultRef = useRef<ProcessedModularSprite | null>(null);
  const [resultVersion, setResultVersion] = useState(0);
  const [recipe, setRecipe] = useState<ModularSpriteProcessingRecipe>(() => structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE));
  const recipeRef = useRef(recipe);
  const [processingRevision, setProcessingRevision] = useState(0);
  const [parts, setParts] = useState<ModularSpriteDraftPart[]>([]);
  const [confirmedKeys, setConfirmedKeys] = useState<Set<string>>(new Set());
  const [selectedRegionIds, setSelectedRegionIds] = useState<Set<number>>(new Set());
  const [assignmentPartKey, setAssignmentPartKey] = useState('');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('result');
  const [tool, setTool] = useState<EditorTool>('select');
  const [brushRadius, setBrushRadius] = useState(0.012);
  const [zoom, setZoom] = useState(1);
  const [showOverlays, setShowOverlays] = useState(true);
  const [advancedFrameKeys, setAdvancedFrameKeys] = useState<Set<string>>(new Set());
  const [name, setName] = useState('Modular Sprite');
  const [addToCanvas, setAddToCanvas] = useState(true);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Processing');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoMatch, setAutoMatch] = useState(true);
  const [schemaMatching, setSchemaMatching] = useState(false);
  const [schemaProgress, setSchemaProgress] = useState({ completed: 0, total: 0 });
  const [schemaMatches, setSchemaMatches] = useState<SchemaComparisonResult[]>([]);
  const [schemas, setSchemas] = useState<ModularSpriteSchema[]>([]);
  const [appliedSchema, setAppliedSchema] = useState<{ schema: ModularSpriteSchema; match: SchemaComparisonResult; modified: boolean } | null>(null);
  const [addSchema, setAddSchema] = useState(false);
  const [schemaSaveMode, setSchemaSaveMode] = useState<'new'|'revision'>('new');
  const [schemaMetadata, setSchemaMetadata] = useState<NewSchemaMetadata>({ name: 'New modular sprite schema', description: '', characterTypeIds: [], characterClassIds: [], tags: [] });
  const [history, setHistory] = useState<EditorSnapshot[]>([]);
  const [future, setFuture] = useState<EditorSnapshot[]>([]);
  const loadedExistingId = useRef<string | null>(null);
  const lastMemory = useRef<{ at: number; kind: HistoryKind } | null>(null);
  const initializedForResult = useRef(false);
  const processGeneration = useRef(0);
  const lastAutoApplied = useRef('');
  const clientRef = useRef(createModularSpriteWorkerClient({ onProgress: update => {
    setProgress(update.progress);
    setStage(update.stage);
  } }));
  const existing = useMemo(
    () => existingId ? project.modularSprites.find(candidate => candidate.id === existingId) : undefined,
    [existingId, project.modularSprites],
  );
  const step = typeof machine.value === 'string' ? machine.value : 'source';

  const reset = useCallback(() => {
    clientRef.current.cancel();
    lastMemory.current = null;
    setFile(null);
    setSource(null);
    setPreviewSource(null);
    setResult(null);
    resultRef.current = null;
    setResultVersion(version => version + 1);
    const defaultRecipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
    recipeRef.current = defaultRecipe;
    setRecipe(defaultRecipe);
    setParts([]);
    setConfirmedKeys(new Set());
    setSelectedRegionIds(new Set());
    setAssignmentPartKey('');
    setAdvancedFrameKeys(new Set());
    setError(null);
    setBusy(false);
    setHistory([]);
    setFuture([]);
    setProgress(0);
    setStage('Processing');
    setSchemaMatches([]);
    setSchemaMatching(false);
    setSchemaProgress({ completed: 0, total: 0 });
    setAppliedSchema(null);
    setAddSchema(false);
    setSchemaSaveMode('new');
    initializedForResult.current = false;
    processGeneration.current += 1;
    lastAutoApplied.current = '';
  }, []);

  useEffect(() => () => clientRef.current.dispose(), []);

  useEffect(() => { if (!open) return; let ignore=false; void localSchemaApi.initialize().then(()=>{if(!ignore)setSchemas(schemaCatalog.list());}).catch(catalogError=>{if(!ignore)setError(catalogError instanceof Error?catalogError.message:'Could not load schema catalog');}); return()=>{ignore=true;}; }, [open]);

  const loadFile = useCallback(async (nextFile: File, existingDocument?: ModularSpriteDocument) => {
    send({ type: 'SOURCE_SELECTED' });
    setBusy(true);
    setStage('Loading image');
    setProgress(0);
    setError(null);
    try {
      const decoded = await decodeModularSpriteFile(nextFile);
      const preview = createPreviewImage(decoded);
      const detected = analyzeModularSpriteBackground(preview);
      const nextRecipe = existingDocument?.recipe ?? {
        ...structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE),
        background: {
          ...DEFAULT_MODULAR_SPRITE_RECIPE.background,
          mode: detected.mode,
          color: detected.color,
        },
      };
      await clientRef.current.warm(preview);
      setFile(nextFile);
      setSource(decoded);
      setPreviewSource(preview);
      const recipeCopy = structuredClone(nextRecipe);
      recipeRef.current = recipeCopy;
      setRecipe(recipeCopy);
      setName(existingDocument?.name ?? (nextFile.name.replace(/\.[^.]+$/, '') || 'Modular Sprite'));
      initializedForResult.current = false;
      send({ type: 'DECODED' });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Could not decode the image';
      setError(message);
      send({ type: 'FAIL', message });
    } finally {
      setBusy(false);
    }
  }, [send]);

  useEffect(() => {
    if (!open || !existing || loadedExistingId.current === existing.id) return;
    loadedExistingId.current = existing.id;
    const texture = project.textures.find(candidate => candidate.id === existing.sourceAssetId);
    if (!texture) {
      setError('The modular sprite source texture is missing');
      return;
    }
    void fetch(texture.source)
      .then(response => response.blob())
      .then(blob => loadFile(new File([blob], texture.fileName || `${existing.name}.png`, { type: 'image/png' }), existing))
      .catch(loadError => setError(loadError instanceof Error ? loadError.message : 'Could not open the source image'));
  }, [existing, loadFile, open, project.textures]);

  useEffect(() => {
    if (!open || existingId) return;
    loadedExistingId.current = null;
  }, [existingId, open]);

  const remember = useCallback((kind: HistoryKind = 'discrete') => {
    const now = Date.now();
    const previous = lastMemory.current;
    const coalesce = kind === 'recipe' && previous?.kind === 'recipe' && now - previous.at < RECIPE_HISTORY_COALESCE_MS;
    lastMemory.current = { at: now, kind };
    if (!coalesce) {
      setHistory(historyState => [...historyState.slice(-49), { recipe: structuredClone(recipe), parts: structuredClone(parts), confirmedKeys: [...confirmedKeys] }]);
    }
    setFuture([]);
    if (kind === 'parts') setAppliedSchema(current => current ? { ...current, modified: true } : null);
    send({ type: 'CHANGE' });
  }, [confirmedKeys, parts, recipe, send]);

  const changeRecipe = useCallback((change: (draft: ModularSpriteProcessingRecipe) => void, kind: HistoryKind = 'recipe', reprocess = true) => {
    remember(kind);
    const next = structuredClone(recipeRef.current);
    change(next);
    recipeRef.current = next;
    setRecipe(next);
    if (reprocess) setProcessingRevision(revision => revision + 1);
  }, [remember]);

  const commitRecipeProcessing = useCallback(() => {
    setProcessingRevision(revision => revision + 1);
  }, []);

  const undoLocal = () => {
    const previous = history.at(-1);
    if (!previous) return;
    lastMemory.current = null;
    setFuture(next => [{ recipe: structuredClone(recipe), parts: structuredClone(parts), confirmedKeys: [...confirmedKeys] }, ...next].slice(0, 50));
    setHistory(items => items.slice(0, -1));
    const previousRecipe = structuredClone(previous.recipe);
    recipeRef.current = previousRecipe;
    setRecipe(previousRecipe);
    setParts(previous.parts);
    setConfirmedKeys(new Set(previous.confirmedKeys));
    setProcessingRevision(revision => revision + 1);
  };

  const redoLocal = () => {
    const next = future[0];
    if (!next) return;
    lastMemory.current = null;
    setHistory(items => [...items.slice(-49), { recipe: structuredClone(recipe), parts: structuredClone(parts), confirmedKeys: [...confirmedKeys] }]);
    setFuture(items => items.slice(1));
    const nextRecipe = structuredClone(next.recipe);
    recipeRef.current = nextRecipe;
    setRecipe(nextRecipe);
    setParts(next.parts);
    setConfirmedKeys(new Set(next.confirmedKeys));
    setProcessingRevision(revision => revision + 1);
  };

  const updatePart = (index: number, change: Partial<ModularSpriteDraftPart>) => {
    remember('parts');
    setParts(previous => previous.map((part, partIndex) => partIndex === index ? { ...part, ...change } : part));
    const currentKey = parts[index]?.partKey;
    if (currentKey) setConfirmedKeys(previous => {
      const next = new Set(previous);
      next.delete(currentKey);
      if (change.partKey) next.delete(change.partKey);
      return next;
    });
  };

  const updateExtractionFrame = (index: number, field: 'x' | 'y' | 'width' | 'height', value: number) => {
    const part = parts[index];
    if (!part || !Number.isFinite(value)) return;
    const frame = { ...part.extractionFrame };
    if (field === 'x') frame.x = Math.min(1 - frame.width, Math.max(0, value));
    if (field === 'y') frame.y = Math.min(1 - frame.height, Math.max(0, value));
    if (field === 'width') frame.width = Math.min(1 - frame.x, Math.max(0.001, value));
    if (field === 'height') frame.height = Math.min(1 - frame.y, Math.max(0.001, value));
    updatePart(index, { extractionFrame: frame });
  };

  const removePart = (index: number) => {
    const partKey = parts[index]?.partKey;
    if (!partKey) return;
    remember('parts');
    setParts(previous => previous.filter((_, partIndex) => partIndex !== index));
    setConfirmedKeys(previous => {
      const next = new Set(previous);
      next.delete(partKey);
      return next;
    });
  };

  const mergeSelected = () => {
    if (selectedRegionIds.size < 2 || !result) return;
    remember('parts');
    const ids = [...selectedRegionIds];
    const affectedKeys = parts
      .filter(part => part.regionIds.some(id => selectedRegionIds.has(id)))
      .map(part => part.partKey);
    const selectedRegions = result.regions.filter(region => selectedRegionIds.has(region.id));
    const bounds = selectedRegions.reduce((accumulator, region) => ({
      x: Math.min(accumulator.x, region.bounds.x),
      y: Math.min(accumulator.y, region.bounds.y),
      maxX: Math.max(accumulator.maxX, region.bounds.x + region.bounds.width),
      maxY: Math.max(accumulator.maxY, region.bounds.y + region.bounds.height),
    }), { x: result.width, y: result.height, maxX: 0, maxY: 0 });
    const synthetic: DetectedRegion = {
      ...selectedRegions[0]!,
      bounds: { x: bounds.x, y: bounds.y, width: bounds.maxX - bounds.x, height: bounds.maxY - bounds.y },
      normalizedBounds: {
        x: bounds.x / result.width,
        y: bounds.y / result.height,
        width: (bounds.maxX - bounds.x) / result.width,
        height: (bounds.maxY - bounds.y) / result.height,
      },
    };
    setParts(previous => {
      const stripped = previous
        .map(part => ({ ...part, regionIds: part.regionIds.filter(id => !selectedRegionIds.has(id)) }))
        .filter(part => part.regionIds.length > 0);
      return [...stripped, {
        ...createPart(synthetic, result.width, result.height, stripped.length, stripped),
        partKey: uniqueKey(`merged-part-${stripped.length + 1}`, stripped),
        regionIds: ids,
      }];
    });
    setConfirmedKeys(previous => {
      const next = new Set(previous);
      for (const partKey of affectedKeys) next.delete(partKey);
      return next;
    });
    setAssignmentPartKey('');
    setSelectedRegionIds(new Set());
  };

  const excludeSelected = () => {
    if (selectedRegionIds.size === 0) return;
    remember('parts');
    const target = parts.find(part => part.partKey === assignmentPartKey);
    if (target && target.regionIds.every(id => selectedRegionIds.has(id))) setAssignmentPartKey('');
    const affectedKeys = parts
      .filter(part => part.regionIds.some(id => selectedRegionIds.has(id)))
      .map(part => part.partKey);
    setParts(previous => previous
      .map(part => ({ ...part, regionIds: part.regionIds.filter(id => !selectedRegionIds.has(id)) }))
      .filter(part => part.regionIds.length > 0));
    setConfirmedKeys(previous => {
      const next = new Set(previous);
      for (const partKey of affectedKeys) next.delete(partKey);
      return next;
    });
    setSelectedRegionIds(new Set());
  };

  const assignSelected = () => {
    if (!assignmentPartKey || selectedRegionIds.size === 0) return;
    remember('parts');
    const affectedKeys = parts
      .filter(part => part.partKey === assignmentPartKey || part.regionIds.some(id => selectedRegionIds.has(id)))
      .map(part => part.partKey);
    setParts(previous => previous.map(part => {
      const withoutSelected = part.regionIds.filter(id => !selectedRegionIds.has(id));
      return part.partKey === assignmentPartKey
        ? { ...part, regionIds: [...withoutSelected, ...selectedRegionIds] }
        : { ...part, regionIds: withoutSelected };
    }).filter(part => part.regionIds.length > 0));
    setConfirmedKeys(previous => {
      const next = new Set(previous);
      for (const partKey of affectedKeys) next.delete(partKey);
      return next;
    });
    setSelectedRegionIds(new Set());
  };

  const toggleRegionSelection = useCallback((regionId: number, additive: boolean) => {
    setSelectedRegionIds(previous => {
      if (!regionId) return additive ? previous : new Set();
      const next = additive ? new Set(previous) : new Set<number>();
      if (next.has(regionId)) next.delete(regionId); else next.add(regionId);
      return next;
    });
  }, []);

  const assignments = useMemo(() => {
    const map = new Map<number, RegionAssignment>();
    if (!result) return map;
    for (const part of parts) {
      const color = partColor(parts, part.partKey);
      for (const regionId of part.regionIds) {
        map.set(regionId, { color, name: part.name });
      }
    }
    return map;
  }, [parts, result]);

  const applyProcessResult = useCallback((nextResult: ProcessedModularSprite) => {
    resultRef.current = nextResult;
    setResult(nextResult);
    setResultVersion(version => version + 1);
    setError(null);
    if (!initializedForResult.current) {
      const initialParts = existing
        ? existingDrafts(existing, nextResult)
        : nextResult.regions.reduce<ModularSpriteDraftPart[]>((all, region, index) => [
          ...all,
          createPart(region, nextResult.width, nextResult.height, index, all),
        ], []);
      setParts(initialParts);
      setConfirmedKeys(new Set(existing ? initialParts.map(part => part.partKey) : []));
      initializedForResult.current = true;
    }
  }, [existing]);

  const applySchemaMatch = useCallback((match: SchemaComparisonResult, currentResult: ProcessedModularSprite = resultRef.current!) => {
    if (!currentResult) return;
    const schema = schemas.find(item => item.schemaId === match.schemaId && item.revision === match.schemaRevision);
    if (!schema) return;
    const roleCatalog = schemaCatalog.semantics;
    const nextParts = schema.slots.flatMap<ModularSpriteDraftPart>((slot, index) => {
      const assignment = match.assignments.find(item => item.slotKey === slot.slotKey);
      const regions = currentResult.regions.filter(region => assignment?.componentIds.includes(region.id));
      if (!regions.length) return [];
      const x = Math.min(...regions.map(item => item.bounds.x)); const y = Math.min(...regions.map(item => item.bounds.y));
      const right = Math.max(...regions.map(item => item.bounds.x + item.bounds.width)); const bottom = Math.max(...regions.map(item => item.bounds.y + item.bounds.height));
      const synthetic: DetectedRegion = { ...regions[0]!, bounds: { x, y, width: right - x, height: bottom - y }, normalizedBounds: { x: x/currentResult.width, y: y/currentResult.height, width: (right-x)/currentResult.width, height: (bottom-y)/currentResult.height } };
      const semantic = slot.semanticRoleId ? roleCatalog.get(slot.semanticRoleId) : undefined;
      const side = slot.qualifiers.side;
      return [{ ...createPart(synthetic,currentResult.width,currentResult.height,index,[]), partKey: slot.slotKey, name: slot.label, role: semantic?.key ?? 'custom', ...(slot.semanticRoleId ? { semanticRoleId: slot.semanticRoleId } : {}), qualifiers: structuredClone(slot.qualifiers), side: side==='left'||side==='right'||side==='center'?side:'none', required:slot.required,order:slot.drawOrder,regionIds:regions.map(item=>item.id) }];
    });
    const used = new Set(nextParts.flatMap(item=>item.regionIds));
    for (const region of currentResult.regions) if (!used.has(region.id)) nextParts.push(createPart(region,currentResult.width,currentResult.height,nextParts.length,nextParts));
    setParts(nextParts); setConfirmedKeys(new Set(nextParts.map(item=>item.partKey))); setAppliedSchema({schema,match,modified:false});
  }, [schemas]);

  useEffect(() => {
    if (!previewSource || !open) return;
    const generation = ++processGeneration.current;
    const timeout = window.setTimeout(() => {
      const processingRecipe = structuredClone(recipeRef.current);
      setBusy(true);
      setStage('Processing');
      setProgress(0);
      const apply = (promise: Promise<ProcessedModularSprite>): Promise<void> => promise
        .then(nextResult => {
          if (generation === processGeneration.current) applyProcessResult(nextResult);
        })
        .catch((processError: unknown) => {
          if (processError instanceof DOMException && processError.name === 'AbortError') return;
          const message = processError instanceof Error ? processError.message : 'Image processing failed';
          if (message.includes('not warmed up')) {
            return apply(clientRef.current.process({ image: previewSource, recipe: processingRecipe }));
          }
          if (generation === processGeneration.current) setError(message);
        });
      void apply(clientRef.current.process({ recipe: processingRecipe }))
        .finally(() => {
          if (generation === processGeneration.current) setBusy(false);
        });
    }, PROCESS_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeout);
      clientRef.current.cancel();
    };
  }, [applyProcessResult, open, previewSource, processingRevision]);

  useEffect(() => {
    if (!open || !autoMatch || !result || !schemas.length) return;
    const controller = new AbortController(); let ignore=false; setSchemaMatching(true); setSchemaProgress({completed:0,total:schemas.length});
    const requestId=crypto.randomUUID();
    void localSchemaApi.match({requestId,observation:result.observation,matcherProfileId:'default-v1'}, {signal:controller.signal,onProgress:event=>{if(!ignore)setSchemaProgress({completed:event.completed,total:event.total});}}).then(response=>{if(ignore)return;setSchemaMatches(response.matches);const best=response.matches[0];const autoKey=`${resultVersion}:${best?.schemaId??''}`;if(best?.confidence==='high'&&lastAutoApplied.current!==autoKey){lastAutoApplied.current=autoKey;applySchemaMatch(best,result);}}).catch(matchError=>{if(!ignore&&!(matchError instanceof DOMException&&matchError.name==='AbortError'))setError(matchError instanceof Error?matchError.message:'Schema matching failed');}).finally(()=>{if(!ignore)setSchemaMatching(false);});
    return()=>{ignore=true;controller.abort();};
  }, [applySchemaMatch, autoMatch, open, result, resultVersion, schemas]);

  const finalize = async () => {
    if (!source || !file || !result) return;
    const keys = parts.map(part => part.partKey);
    if (parts.length === 0 || keys.some(key => !key) || new Set(keys).size !== keys.length) {
      setError('Every part needs a unique, non-empty key');
      return;
    }
    if (parts.some(part => !part.name.trim() || !part.role.trim() || part.regionIds.length === 0)) {
      setError('Every part needs a name, role, and assigned region');
      return;
    }
    if (parts.some(part => !confirmedKeys.has(part.partKey))) {
      setError('Confirm every semantic part assignment before importing');
      return;
    }
    send({ type: 'FINALIZE' });
    setBusy(true);
    setStage('Extracting parts');
    setProgress(0);
    setError(null);
    try {
      const fullResult = await clientRef.current.process({ image: source, recipe });
      const used = new Set<number>();
      const fullParts = parts.map(part => {
        const previewRegions = part.regionIds
          .map(regionId => result.regions.find(region => region.id === regionId))
          .filter((region): region is DetectedRegion => !!region);
        const mappedIds = previewRegions
          .map(region => nearestRegionId(region.centroid, fullResult.regions, used))
          .filter((regionId): regionId is number => regionId !== null);
        return { ...part, regionIds: mappedIds };
      });
      if (fullParts.some(part => part.regionIds.length === 0)) throw new Error('A confirmed part could not be matched at full resolution');
      const extracted = await clientRef.current.extract({ image: source, recipe }, fullParts);
      const overflow = extracted.find(part => part.overflow);
      if (overflow) throw new Error(`Content for "${overflow.partKey}" extends outside its stable extraction frame. Save as a new set instead.`);
      const sourceBlob = await encodeRgbaPng(source);
      const commitParts = await Promise.all(extracted.map(async extractedPart => ({
        draft: fullParts.find(part => part.partKey === extractedPart.partKey)!,
        image: extractedPart.image,
        blob: await encodeRgbaPng(extractedPart.image),
        contentBounds: extractedPart.contentBounds,
        componentSeeds: extractedPart.componentSeeds,
      })));
      let boundSchema = appliedSchema?.schema;
      if (addSchema) {
        const assetId = `schema-asset-${crypto.randomUUID()}`;
        const revisionTarget = schemaSaveMode === 'revision' && appliedSchema?.schema.origin.kind === 'user' ? appliedSchema.schema : undefined;
        boundSchema = createUserSchema({ metadata: { ...schemaMetadata, name: schemaMetadata.name.trim() || `${name} schema` }, parts: fullParts, observation: fullResult.observation, referenceAsset: { assetId, mimeType: 'image/png', width: source.width, height: source.height }, ...(revisionTarget ? { schemaId: revisionTarget.schemaId, revision: revisionTarget.revision + 1 } : {}) });
        boundSchema.thumbnailAsset = boundSchema.referenceAsset;
        await localSchemaApi.saveAsset({ ...boundSchema.referenceAsset, blob: sourceBlob });
        await localSchemaApi.save(boundSchema);
        setSchemas(schemaCatalog.list());
      }
      const slotToPartKey: Record<string,string> = {};
      if (boundSchema) for (const slot of boundSchema.slots) {
        const assignment = appliedSchema?.match.assignments.find(item=>item.slotKey===slot.slotKey);
        const part = assignment ? parts.find(item=>item.regionIds.some(id=>assignment.componentIds.includes(id))) : fullParts.find(item=>item.partKey===slot.slotKey);
        if (part) slotToPartKey[slot.slotKey]=part.partKey;
      }
      const schemaBinding = boundSchema ? { schemaId: boundSchema.schemaId, schemaRevision: boundSchema.revision, compositionId: boundSchema.compositionId, slotToPartKey, snapshot: portableSnapshot(boundSchema) } : undefined;
      await onCommit({ ...(existing ? { existingId: existing.id } : {}), name: name.trim() || 'Modular Sprite', sourceFileName: file.name, sourceImage: source, sourceBlob, recipe, parts: commitParts, addToCanvas, ...(schemaBinding ? { schemaBinding } : {}) });
      send({ type: 'SUCCESS' });
      reset();
      onOpenChange(false);
    } catch (finalizeError) {
      const message = finalizeError instanceof Error ? finalizeError.message : 'Could not import the modular sprite';
      setError(message);
      send({ type: 'FAIL', message });
    } finally {
      setBusy(false);
    }
  };

  const requestClose = () => {
    if ((machine.context.dirty || !!source) && !window.confirm('Discard the unsaved modular sprite changes?')) return;
    reset();
    loadedExistingId.current = null;
    onOpenChange(false);
  };

  const canGoNext = step === 'background' ? !!result : step === 'regions' ? parts.length > 0 : step === 'parts'
    ? parts.length > 0 && parts.every(part => part.regionIds.length > 0 && confirmedKeys.has(part.partKey)) : false;

  useEffect(() => {
    send({ type: 'SET_READY', step: 'background', ready: !!result });
    send({ type: 'SET_READY', step: 'regions', ready: parts.length > 0 });
    send({
      type: 'SET_READY',
      step: 'parts',
      ready: parts.length > 0 && parts.every(part => part.regionIds.length > 0 && confirmedKeys.has(part.partKey)),
    });
  }, [confirmedKeys, parts, result, send]);

  const toggleAdvancedFrame = (partKey: string) => {
    setAdvancedFrameKeys(previous => {
      const next = new Set(previous);
      if (next.has(partKey)) next.delete(partKey); else next.add(partKey);
      return next;
    });
  };

  return (
    <UiDialog open={open} onOpenChange={nextOpen => { if (!nextOpen) requestClose(); }}>
      <UiDialogContent className="flex h-[95vh] w-[95vw] max-w-none flex-col gap-0 overflow-hidden p-0">
        <UiDialogHeader className="border-b px-6 py-4">
          <UiDialogTitle>{existing ? `Edit ${existing.name}` : 'Import 2D Modular Sprite'}</UiDialogTitle>
          <UiDialogDescription>Extract reusable transparent parts from an alpha or controlled chroma-key sheet.</UiDialogDescription>
        </UiDialogHeader>

        <div className="flex border-b px-6 py-2">
          {STEPS.map((item, index) => <div key={item} className={`flex-1 text-center text-xs font-medium capitalize ${item === step ? 'text-primary' : 'text-muted-foreground'}`}>{index + 1}. {STEP_LABELS[item]}</div>)}
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto p-5">
          {step === 'source' && (
            <label className="flex h-full min-h-80 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 p-8 text-center hover:border-primary/60" onDragOver={event => event.preventDefault()} onDrop={event => {
              event.preventDefault();
              const dropped = event.dataTransfer.files[0];
              if (dropped) void loadFile(dropped);
            }}>
              <span className="text-lg font-medium">Drop a PNG, JPEG, or WebP sheet</span>
              <span className="mt-2 text-sm text-muted-foreground">Up to 50 MiB, 8192 px per side, and 20 megapixels</span>
              <UiInput className="mt-6 max-w-sm" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
                const selected = event.target.files?.[0];
                if (selected) void loadFile(selected);
              }} />
            </label>
          )}

          {(step === 'background' || step === 'regions') && source && previewSource && (
            <div className={`grid h-full min-h-[500px] gap-5 ${step === 'background' ? 'grid-cols-[280px_minmax(0,1fr)_300px]' : 'grid-cols-[280px_minmax(0,1fr)]'}`}>
              <aside className="space-y-4 overflow-auto rounded-lg border p-4">
                {step === 'background' ? <>
                  <p className="text-xs text-muted-foreground">The keyer removes the background color (or uses existing alpha) and finds connected regions. Use the touch-up tools below to fix the mask.</p>
                  <FieldLabel>Mode<select className="h-9 rounded-md border bg-background px-2" value={recipe.background.mode} onChange={event => changeRecipe(draft => { draft.background.mode = event.target.value as 'alpha' | 'chroma'; })}><option value="alpha">Existing alpha</option><option value="chroma">Chroma key</option></select></FieldLabel>
                  <FieldLabel>Background color<input className="h-9 w-full" type="color" value={colorToHex(recipe.background.color)} onChange={event => changeRecipe(draft => { draft.background.color = hexToColor(event.target.value); })} /></FieldLabel>
                  <UiButton size="sm" variant={tool === 'eyedropper' ? 'default' : 'outline'} onClick={() => { setTool('eyedropper'); setPreviewMode('original'); }}>Pick from image</UiButton>
                  <FieldLabel>Tolerance: {recipe.background.tolerance.toFixed(3)}<UiSlider min={0} max={0.25} step={0.002} value={[recipe.background.tolerance]} onValueChange={value => changeRecipe(draft => { draft.background.tolerance = value[0] ?? draft.background.tolerance; }, 'recipe', false)} onValueCommit={commitRecipeProcessing} /></FieldLabel>
                  <FieldLabel>Soft edge: {recipe.background.softness.toFixed(3)}<UiSlider min={0.002} max={0.25} step={0.002} value={[recipe.background.softness]} onValueChange={value => changeRecipe(draft => { draft.background.softness = value[0] ?? draft.background.softness; }, 'recipe', false)} onValueCommit={commitRecipeProcessing} /></FieldLabel>
                  <FieldLabel>Despill: {recipe.background.despill.toFixed(2)}<UiSlider min={0} max={1} step={0.02} value={[recipe.background.despill]} onValueChange={value => changeRecipe(draft => { draft.background.despill = value[0] ?? draft.background.despill; }, 'recipe', false)} onValueCommit={commitRecipeProcessing} /></FieldLabel>
                  <FieldLabel>Detection alpha: {recipe.detection.alphaThreshold}<UiSlider min={1} max={254} step={1} value={[recipe.detection.alphaThreshold]} onValueChange={value => changeRecipe(draft => { draft.detection.alphaThreshold = value[0] ?? draft.detection.alphaThreshold; }, 'recipe', false)} onValueCommit={commitRecipeProcessing} /></FieldLabel>
                  <FieldLabel>Opening radius: {recipe.detection.openingRadius}px<UiSlider min={0} max={8} step={1} value={[recipe.detection.openingRadius]} onValueChange={value => changeRecipe(draft => { draft.detection.openingRadius = value[0] ?? draft.detection.openingRadius; }, 'recipe', false)} onValueCommit={commitRecipeProcessing} /></FieldLabel>
                  <FieldLabel>Closing radius: {recipe.detection.closingRadius}px<UiSlider min={0} max={8} step={1} value={[recipe.detection.closingRadius]} onValueChange={value => changeRecipe(draft => { draft.detection.closingRadius = value[0] ?? draft.detection.closingRadius; }, 'recipe', false)} onValueCommit={commitRecipeProcessing} /></FieldLabel>
                  <FieldLabel>Minimum island: {(recipe.detection.minimumRegionAreaRatio * 100).toFixed(3)}%<UiSlider min={0} max={0.01} step={0.00005} value={[recipe.detection.minimumRegionAreaRatio]} onValueChange={value => changeRecipe(draft => { draft.detection.minimumRegionAreaRatio = value[0] ?? draft.detection.minimumRegionAreaRatio; }, 'recipe', false)} onValueCommit={commitRecipeProcessing} /></FieldLabel>
                  {result?.warnings.map(warning => <p key={warning} className="rounded bg-amber-500/10 p-2 text-xs text-amber-500">{warning}</p>)}
                  <div className="space-y-2 border-t pt-3">
                    <div className="text-xs font-medium">Touch-up tools</div>
                    <div className="grid grid-cols-2 gap-2">
                      <UiButton size="sm" variant={tool === 'select' ? 'default' : 'outline'} onClick={() => setTool('select')}><MousePointer2 className="mr-1 h-4 w-4" />Select</UiButton>
                      <UiButton size="sm" variant={tool === 'foreground' ? 'default' : 'outline'} onClick={() => setTool('foreground')}><Paintbrush className="mr-1 h-4 w-4" />Keep</UiButton>
                      <UiButton size="sm" variant={tool === 'background' ? 'default' : 'outline'} onClick={() => setTool('background')}><Eraser className="mr-1 h-4 w-4" />Erase</UiButton>
                      <UiButton size="sm" variant={tool === 'split' ? 'default' : 'outline'} onClick={() => setTool('split')}><Scissors className="mr-1 h-4 w-4" />Split</UiButton>
                    </div>
                    <FieldLabel>Brush radius: {(brushRadius * 100).toFixed(1)}%<UiSlider min={0.002} max={0.08} step={0.002} value={[brushRadius]} onValueChange={value => setBrushRadius(value[0] ?? brushRadius)} /></FieldLabel>
                    <p className="text-xs text-muted-foreground">Keep and Erase paint the transparent mask. Split cuts a region in two so it can be assigned to different parts; the exported image alpha stays continuous.</p>
                  </div>
                </> : <>
                  <p className="text-xs text-muted-foreground">Group detected regions into the images that should be imported as parts. Part names come from detection or schema matching; correct them directly in the tree when needed. Anatomical roles are reviewed in the next step. Shift-click selects several regions.</p>
                  <UiButton className="w-full" size="sm" variant={tool === 'select' ? 'default' : 'outline'} onClick={() => setTool('select')}><MousePointer2 className="mr-1 h-4 w-4" />Select</UiButton>
                  <FieldLabel>Existing target part<select className="h-9 w-full rounded-md border bg-background px-2 text-xs" value={assignmentPartKey} onChange={event => setAssignmentPartKey(event.target.value)}>
                    <option value="">Choose an existing part…</option>
                    {parts.map(part => <option key={part.partKey} value={part.partKey}>{part.name}</option>)}
                  </select></FieldLabel>
                  <UiButton className="w-full" size="sm" variant="outline" disabled={!assignmentPartKey || selectedRegionIds.size === 0} onClick={assignSelected}>Move selection to target part</UiButton>
                  <UiButton className="w-full" size="sm" variant="outline" disabled={selectedRegionIds.size < 2} onClick={mergeSelected}><Merge className="mr-1 h-4 w-4" />Create new part from selection</UiButton>
                  <UiButton className="w-full" size="sm" variant="outline" disabled={selectedRegionIds.size === 0} onClick={excludeSelected}>Exclude selection from import</UiButton>
                  <p className="text-[11px] text-muted-foreground">Excluded regions stay visible in muted gray so you can select them and move them back into a part. They will not be imported.</p>
                  <div className="space-y-2 border-t pt-3">
                    <div className="text-xs font-medium">Parts and regions</div>
                    {parts.map((part, partIndex) => {
                      const color = partColor(parts, part.partKey);
                      return (
                        <div key={part.partKey} className="overflow-hidden rounded-md border bg-muted/10">
                          <div className="flex items-center gap-2 border-b px-2 py-1.5 text-xs font-semibold">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                            <span className="shrink-0 text-muted-foreground">Part</span>
                            <UiInput
                              className="h-7 min-w-0 flex-1 px-2 text-xs font-medium"
                              aria-label={`Name of part ${partIndex + 1}`}
                              value={part.name}
                              onChange={event => updatePart(partIndex, { name: event.target.value })}
                            />
                            <span className="ml-auto font-normal text-muted-foreground">{part.regionIds.length} {part.regionIds.length === 1 ? 'region' : 'regions'}</span>
                          </div>
                          <ul className="ml-4 space-y-1 border-l py-1 pl-2 pr-1">
                            {part.regionIds.map(regionId => {
                              const region = result?.regions.find(item => item.id === regionId);
                              if (!region) return null;
                              const isSelected = selectedRegionIds.has(region.id);
                              return (
                                <li key={region.id}>
                                  <button
                                    type="button"
                                    className={`flex min-h-10 w-full items-center gap-2 rounded border px-1.5 py-1 text-left text-xs ${isSelected ? 'border-primary bg-primary/10' : 'border-transparent hover:border-border hover:bg-muted/50'}`}
                                    onClick={event => toggleRegionSelection(region.id, event.shiftKey)}
                                  >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border bg-black/30">
                                      <PartThumbnail resultRef={resultRef} resultVersion={resultVersion} regionIds={[region.id]} maxSize={30} />
                                    </span>
                                    <span className="truncate">Region {region.id}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                    {result && result.regions.some(region => !assignments.has(region.id)) && (
                      <div className="overflow-hidden rounded-md border border-slate-500/70 bg-slate-500/20 text-muted-foreground">
                        <div className="flex items-center gap-2 border-b border-slate-500/50 px-2 py-1.5 text-xs font-semibold">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-500" />
                          <span>Excluded</span>
                          <span className="ml-auto font-normal">{result.regions.filter(region => !assignments.has(region.id)).length}</span>
                        </div>
                        <ul className="ml-4 space-y-1 border-l border-slate-500/50 py-1 pl-2 pr-1">
                          {result.regions.filter(region => !assignments.has(region.id)).map(region => {
                            const isSelected = selectedRegionIds.has(region.id);
                            return (
                              <li key={region.id}>
                                <button
                                  type="button"
                                  className={`flex min-h-10 w-full items-center gap-2 rounded border px-1.5 py-1 text-left text-xs ${isSelected ? 'border-primary bg-primary/10' : 'border-transparent hover:border-slate-500 hover:bg-slate-500/30'}`}
                                  onClick={event => toggleRegionSelection(region.id, event.shiftKey)}
                                >
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-500/60 bg-slate-700/40 opacity-70 grayscale">
                                    <PartThumbnail resultRef={resultRef} resultVersion={resultVersion} regionIds={[region.id]} maxSize={30} />
                                  </span>
                                  <span className="truncate">Region {region.id}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </>}
                <div className="flex gap-2 border-t pt-3"><UiButton size="icon" variant="outline" disabled={!history.length} onClick={undoLocal}><Undo2 className="h-4 w-4" /></UiButton><UiButton size="icon" variant="outline" disabled={!future.length} onClick={redoLocal}><Redo2 className="h-4 w-4" /></UiButton></div>
              </aside>
              <section className="flex min-h-0 flex-col rounded-lg border bg-black/40">
                <div className="flex items-center gap-1 border-b bg-background p-2">
                  {(['original', 'matte', 'result'] as const).map(mode => <UiButton key={mode} size="sm" variant={previewMode === mode ? 'default' : 'ghost'} onClick={() => setPreviewMode(mode)}>{mode}</UiButton>)}
                  <span className="mx-1 h-5 w-px bg-border" />
                  <label className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                    <UiSwitch checked={showOverlays} onCheckedChange={value => setShowOverlays(value)} />
                    Region outlines
                  </label>
                  <UiButton size="sm" variant="ghost" onClick={() => setZoom(value => Math.max(0.25, value - 0.25))}>−</UiButton>
                  <span className="self-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
                  <UiButton size="sm" variant="ghost" onClick={() => setZoom(value => Math.min(4, value + 0.25))}>+</UiButton>
                  <span className="ml-auto self-center text-xs text-muted-foreground">{busy ? `${stage}… ${Math.round(progress * 100)}%` : `${result?.regions.length ?? 0} regions`}</span>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
                  <ModularSpritePreviewCanvas source={previewSource} resultRef={resultRef} resultVersion={resultVersion} mode={previewMode} tool={tool} zoom={zoom} selectedRegionIds={selectedRegionIds} assignments={assignments} showOverlays={showOverlays} onSelectRegion={toggleRegionSelection} onPickColor={color => { changeRecipe(draft => { draft.background.mode = 'chroma'; draft.background.color = color; }, 'discrete'); setTool('select'); }} onStroke={(kind, points) => changeRecipe(draft => { draft.strokes.push({ kind, radius: brushRadius, points }); }, 'discrete')} />
                </div>
              </section>
              {step === 'background' && <SchemaComparisonSidebar enabled={autoMatch} onEnabledChange={setAutoMatch} analyzing={schemaMatching} progress={schemaProgress} matches={schemaMatches} schemas={schemas} {...(appliedSchema ? { appliedSchemaId: appliedSchema.schema.schemaId } : {})} onApply={applySchemaMatch} />}
            </div>
          )}

          {step === 'parts' && (
            <div className="mx-auto max-w-3xl space-y-3">
              <p className="text-sm text-muted-foreground">Name each imported part and describe what it represents. Name identifies this specific image (for example “Red left glove”); Role describes its reusable anatomical meaning (for example “hand”). Then confirm each part. Excluded regions from the previous step are not imported.</p>
              {parts.map((part, index) => <div key={`${part.partKey}-${index}`} className="space-y-3 rounded-lg border p-3">
                <div className="flex gap-3">
                  <PartThumbnail resultRef={resultRef} resultVersion={resultVersion} regionIds={part.regionIds} />
                  <div className="grid min-w-0 flex-1 content-start gap-2">
                    <div className="grid grid-cols-[1fr_1fr_150px_110px_70px] items-end gap-2">
                      <FieldLabel>Name<UiInput value={part.name} onChange={event => updatePart(index, { name: event.target.value })} /></FieldLabel>
                      <FieldLabel>Stable key<UiInput value={part.partKey} onChange={event => updatePart(index, { partKey: slug(event.target.value) })} /></FieldLabel>
                      <FieldLabel>Role<SemanticRolePicker role={part.role} {...(part.semanticRoleId ? { semanticRoleId: part.semanticRoleId } : {})} onChange={value => updatePart(index, value)} /></FieldLabel>
                      <FieldLabel>Side<select className="h-10 rounded-md border bg-background px-2" value={part.side} onChange={event => updatePart(index, { side: event.target.value as ModularSpriteDraftPart['side'] })}><option value="none">none</option><option value="left">left</option><option value="right">right</option><option value="center">center</option></select></FieldLabel>
                      <FieldLabel>Order<UiInput type="number" value={part.order} onChange={event => updatePart(index, { order: Number(event.target.value) })} /></FieldLabel>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={part.required} onChange={event => updatePart(index, { required: event.target.checked })} />Required</label>
                      <UiButton size="sm" variant={confirmedKeys.has(part.partKey) ? 'outline' : 'default'} onClick={() => setConfirmedKeys(previous => new Set(previous).add(part.partKey))}><Check className="mr-1 h-3 w-3" />{confirmedKeys.has(part.partKey) ? 'Confirmed' : 'Confirm'}</UiButton>
                      <UiButton size="sm" variant="ghost" onClick={() => toggleAdvancedFrame(part.partKey)}>{advancedFrameKeys.has(part.partKey) ? 'Hide extraction frame' : 'Extraction frame'}</UiButton>
                      <UiButton className="ml-auto" size="sm" variant="destructive" onClick={() => removePart(index)}>Remove part</UiButton>
                    </div>
                    <details className="rounded-md border bg-muted/20 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-medium">Additional attributes (optional)</summary>
                      <div className="mt-2 grid gap-2">
                        <p className="text-xs text-muted-foreground">Use these only when the role and side are not specific enough. They help schemas distinguish details such as an upper wing, a lower limb segment, or one finger. They do not change the extracted image.</p>
                        <FieldLabel>Attributes
                          <UiInput
                            placeholder="segment=lower, limbIndex=3"
                            value={Object.entries(part.qualifiers ?? {}).map(([key,value])=>`${key}=${value}`).join(', ')}
                            onChange={event=>updatePart(index,{qualifiers:parseQualifiers(event.target.value)})}
                          />
                        </FieldLabel>
                        <p className="text-[11px] text-muted-foreground">Format: <code>name=value</code>, separated with commas. Examples: <code>segment=lower</code>, <code>finger=index</code>, <code>wing=upper-left</code>.</p>
                      </div>
                    </details>
                  </div>
                </div>
                {advancedFrameKeys.has(part.partKey) && (
                  <div className="grid grid-cols-[repeat(4,1fr)] items-end gap-2 border-t pt-2">
                    {(['x', 'y', 'width', 'height'] as const).map(field => <FieldLabel key={field}>Frame {field} (%)
                      <UiInput type="number" min={0} max={100} step={0.1} value={Number((part.extractionFrame[field] * 100).toFixed(1))} onChange={event => updateExtractionFrame(index, field, Number(event.target.value) / 100)} />
                    </FieldLabel>)}
                  </div>
                )}
              </div>)}
              <SchemaEditor enabled={addSchema} onEnabledChange={setAddSchema} value={schemaMetadata} onChange={setSchemaMetadata} existingApplied={!!appliedSchema} canRevise={appliedSchema?.schema.origin.kind === 'user'} saveMode={schemaSaveMode} onSaveModeChange={setSchemaSaveMode} />
            </div>
          )}

          {step === 'review' && <div className="mx-auto grid max-w-2xl gap-5">
            <FieldLabel>Set and folder name<UiInput value={name} onChange={event => { setName(event.target.value); send({ type: 'CHANGE' }); }} /></FieldLabel>
            <label className="flex items-center gap-3 rounded-lg border p-4 text-sm"><input type="checkbox" checked={addToCanvas} onChange={event => setAddToCanvas(event.target.checked)} />Add arranged parts to canvas</label>
            <div className="rounded-lg border p-4"><div className="font-medium">{parts.length} parts ready</div><ul className="mt-2 grid grid-cols-2 gap-1 text-sm text-muted-foreground">{[...parts].sort((a, b) => a.order - b.order).map(part => <li key={part.partKey}><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: partColor(parts, part.partKey) }} />{part.name} · {part.role} · {part.side}</li>)}</ul></div>
            {file?.type === 'image/jpeg' && <p className="rounded bg-amber-500/10 p-3 text-sm text-amber-500">JPEG compression can leave a colored halo around extracted parts.</p>}
          </div>}

          {(step === 'failure' || error) && <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error ?? machine.context.error}</p>}

          {busy && (
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/70 backdrop-blur-[2px]">
              <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden />
              <span className="text-sm font-medium">{stage}…</span>
              <span className="text-xs text-muted-foreground">{Math.round(progress * 100)}%</span>
            </div>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t px-6 py-3">
          <UiButton variant="ghost" onClick={requestClose}>Cancel</UiButton><span className="flex-1" />
          {STEPS.includes(step as ModularSpriteWizardStep) && step !== 'source' && <UiButton variant="outline" disabled={busy} onClick={() => send({ type: 'BACK' })}>Back</UiButton>}
          {(step === 'background' || step === 'regions' || step === 'parts') && <UiButton disabled={busy || !canGoNext} onClick={() => send({ type: 'NEXT' })}>Continue</UiButton>}
          {step === 'review' && <UiButton disabled={busy} onClick={() => void finalize()}>{busy ? 'Finalizing…' : existing ? 'Update set' : 'Import set'}</UiButton>}
          {step === 'failure' && <UiButton onClick={() => send({ type: 'RETRY' })}>Back to review</UiButton>}
        </footer>
      </UiDialogContent>
    </UiDialog>
  );
}
