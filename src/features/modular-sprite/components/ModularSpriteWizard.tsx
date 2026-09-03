import { useMachine } from '@xstate/react';
import { Check, Eraser, Merge, MousePointer2, Paintbrush, Redo2, Scissors, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  ModularSpriteDocument,
  ModularSpriteId,
  ModularSpriteMaskStrokeKind,
  ModularSpriteProcessingRecipe,
  NormalizedPoint,
} from '@kukla2d/contracts';

import { useProjectStore } from '@/store/projectStore';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

import { ModularSpritePreviewCanvas } from './ModularSpritePreviewCanvas.js';
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
}>;
const UiDialog = Dialog as React.ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }>;
const UiDialogContent = DialogContent as React.ComponentType<{ className?: string; children: React.ReactNode }>;
const UiDialogDescription = DialogDescription as React.ComponentType<{ children: React.ReactNode }>;
const UiDialogHeader = DialogHeader as React.ComponentType<{ className?: string; children: React.ReactNode }>;
const UiDialogTitle = DialogTitle as React.ComponentType<{ children: React.ReactNode }>;

const STEPS: ModularSpriteWizardStep[] = ['source', 'background', 'regions', 'parts', 'review'];
const ROLES = ['head', 'torso', 'upper-arm', 'forearm', 'hand', 'thigh', 'lower-leg', 'foot', 'weapon', 'prop', 'accessory', 'custom'];

interface ModularSpriteWizardProps {
  open: boolean;
  existingId?: ModularSpriteId | null;
  onOpenChange: (open: boolean) => void;
  onCommit: (request: ModularSpriteCommitRequest) => Promise<unknown>;
}

interface EditorSnapshot {
  recipe: ModularSpriteProcessingRecipe;
  parts: ModularSpriteDraftPart[];
}

type PreviewMode = 'original' | 'matte' | 'result';
type EditorTool = 'select' | 'eyedropper' | ModularSpriteMaskStrokeKind;

function slug(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'part';
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

function createPart(region: DetectedRegion, sourceWidth: number, sourceHeight: number, index: number, existingParts: ModularSpriteDraftPart[]): ModularSpriteDraftPart {
  const suggested = region.suggestedRole || 'custom';
  const name = suggested === 'custom' ? `Part ${index + 1}` : suggested.replaceAll('-', ' ');
  return {
    partKey: uniqueKey(slug(name), existingParts),
    name,
    role: suggested,
    side: 'none',
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

export function ModularSpriteWizard({ open, existingId, onOpenChange, onCommit }: ModularSpriteWizardProps): React.ReactElement {
  const [machine, send] = useMachine(modularSpriteWizardMachine);
  const project = useProjectStore(state => state.project);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<RgbaImageData | null>(null);
  const [previewSource, setPreviewSource] = useState<RgbaImageData | null>(null);
  const [result, setResult] = useState<ProcessedModularSprite | null>(null);
  const [recipe, setRecipe] = useState<ModularSpriteProcessingRecipe>(() => structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE));
  const [parts, setParts] = useState<ModularSpriteDraftPart[]>([]);
  const [confirmedKeys, setConfirmedKeys] = useState<Set<string>>(new Set());
  const [selectedRegionIds, setSelectedRegionIds] = useState<Set<number>>(new Set());
  const [assignmentPartKey, setAssignmentPartKey] = useState('');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('result');
  const [tool, setTool] = useState<EditorTool>('select');
  const [brushRadius, setBrushRadius] = useState(0.012);
  const [zoom, setZoom] = useState(1);
  const [name, setName] = useState('Modular Sprite');
  const [addToCanvas, setAddToCanvas] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<EditorSnapshot[]>([]);
  const [future, setFuture] = useState<EditorSnapshot[]>([]);
  const loadedExistingId = useRef<string | null>(null);
  const previousStep = useRef<string>('source');
  const initializedForResult = useRef(false);
  const clientRef = useRef(createModularSpriteWorkerClient({ onProgress: update => setProgress(update.progress) }));
  const existing = useMemo(
    () => existingId ? project.modularSprites.find(candidate => candidate.id === existingId) : undefined,
    [existingId, project.modularSprites],
  );
  const step = typeof machine.value === 'string' ? machine.value : 'source';

  useEffect(() => {
    const prior = previousStep.current;
    previousStep.current = step;
    if (prior !== step && (prior === 'background' || prior === 'regions')) clientRef.current.cancel();
  }, [step]);

  const reset = useCallback(() => {
    clientRef.current.cancel();
    setFile(null);
    setSource(null);
    setPreviewSource(null);
    setResult(null);
    setRecipe(structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE));
    setParts([]);
    setConfirmedKeys(new Set());
    setSelectedRegionIds(new Set());
    setAssignmentPartKey('');
    setError(null);
    setBusy(false);
    setHistory([]);
    setFuture([]);
    setProgress(0);
    initializedForResult.current = false;
  }, []);

  useEffect(() => () => clientRef.current.dispose(), []);

  const loadFile = useCallback(async (nextFile: File, existingDocument?: ModularSpriteDocument) => {
    send({ type: 'SOURCE_SELECTED' });
    setBusy(true);
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
      setFile(nextFile);
      setSource(decoded);
      setPreviewSource(preview);
      setRecipe(structuredClone(nextRecipe));
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

  useEffect(() => {
    if (!previewSource || !open) return;
    const timeout = window.setTimeout(() => {
      setBusy(true);
      clientRef.current.process({ image: previewSource, recipe })
        .then(nextResult => {
          setResult(nextResult);
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
        })
        .catch(processError => {
          if (processError instanceof DOMException && processError.name === 'AbortError') return;
          setError(processError instanceof Error ? processError.message : 'Image processing failed');
        })
        .finally(() => setBusy(false));
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [existing, open, previewSource, recipe]);

  const remember = useCallback(() => {
    setHistory(previous => [...previous.slice(-49), { recipe: structuredClone(recipe), parts: structuredClone(parts) }]);
    setFuture([]);
    send({ type: 'CHANGE' });
  }, [parts, recipe, send]);

  const changeRecipe = useCallback((change: (draft: ModularSpriteProcessingRecipe) => void) => {
    remember();
    setRecipe(previous => {
      const next = structuredClone(previous);
      change(next);
      return next;
    });
  }, [remember]);

  const undoLocal = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture(next => [{ recipe: structuredClone(recipe), parts: structuredClone(parts) }, ...next].slice(0, 50));
    setHistory(items => items.slice(0, -1));
    setRecipe(previous.recipe);
    setParts(previous.parts);
  };

  const redoLocal = () => {
    const next = future[0];
    if (!next) return;
    setHistory(items => [...items.slice(-49), { recipe: structuredClone(recipe), parts: structuredClone(parts) }]);
    setFuture(items => items.slice(1));
    setRecipe(next.recipe);
    setParts(next.parts);
  };

  const updatePart = (index: number, change: Partial<ModularSpriteDraftPart>) => {
    remember();
    setParts(previous => previous.map((part, partIndex) => partIndex === index ? { ...part, ...change } : part));
    const currentKey = parts[index]?.partKey;
    if (currentKey) setConfirmedKeys(previous => new Set(previous).add(change.partKey ?? currentKey));
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
    remember();
    setParts(previous => previous.filter((_, partIndex) => partIndex !== index));
    setConfirmedKeys(previous => {
      const next = new Set(previous);
      next.delete(partKey);
      return next;
    });
  };

  const mergeSelected = () => {
    if (selectedRegionIds.size < 2 || !result) return;
    remember();
    const ids = [...selectedRegionIds];
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
        name: `Merged part ${stripped.length + 1}`,
        partKey: uniqueKey(`merged-part-${stripped.length + 1}`, stripped),
        regionIds: ids,
      }];
    });
    setSelectedRegionIds(new Set());
  };

  const deleteSelected = () => {
    if (selectedRegionIds.size === 0) return;
    remember();
    setParts(previous => previous
      .map(part => ({ ...part, regionIds: part.regionIds.filter(id => !selectedRegionIds.has(id)) }))
      .filter(part => part.regionIds.length > 0));
    setSelectedRegionIds(new Set());
  };

  const assignSelected = () => {
    if (!assignmentPartKey || selectedRegionIds.size === 0) return;
    remember();
    setParts(previous => previous.map(part => {
      const withoutSelected = part.regionIds.filter(id => !selectedRegionIds.has(id));
      return part.partKey === assignmentPartKey
        ? { ...part, regionIds: [...withoutSelected, ...selectedRegionIds] }
        : { ...part, regionIds: withoutSelected };
    }));
    setConfirmedKeys(previous => {
      const next = new Set(previous);
      next.delete(assignmentPartKey);
      return next;
    });
    setSelectedRegionIds(new Set());
  };

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
      await onCommit({ ...(existing ? { existingId: existing.id } : {}), name: name.trim() || 'Modular Sprite', sourceFileName: file.name, sourceImage: source, sourceBlob, recipe, parts: commitParts, addToCanvas });
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

  return (
    <UiDialog open={open} onOpenChange={nextOpen => { if (!nextOpen) requestClose(); }}>
      <UiDialogContent className="flex h-[95vh] w-[95vw] max-w-none flex-col gap-0 overflow-hidden p-0">
        <UiDialogHeader className="border-b px-6 py-4">
          <UiDialogTitle>{existing ? `Edit ${existing.name}` : 'Import 2D Modular Sprite'}</UiDialogTitle>
          <UiDialogDescription>Extract reusable transparent parts from an alpha or controlled chroma-key sheet.</UiDialogDescription>
        </UiDialogHeader>

        <div className="flex border-b px-6 py-2">
          {STEPS.map((item, index) => <div key={item} className={`flex-1 text-center text-xs font-medium capitalize ${item === step ? 'text-primary' : 'text-muted-foreground'}`}>{index + 1}. {item}</div>)}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
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
            <div className="grid h-full min-h-[500px] grid-cols-[260px_minmax(0,1fr)] gap-5">
              <aside className="space-y-4 overflow-auto rounded-lg border p-4">
                {step === 'background' ? <>
                  <FieldLabel>Mode<select className="h-9 rounded-md border bg-background px-2" value={recipe.background.mode} onChange={event => changeRecipe(draft => { draft.background.mode = event.target.value as 'alpha' | 'chroma'; })}><option value="alpha">Existing alpha</option><option value="chroma">Chroma key</option></select></FieldLabel>
                  <FieldLabel>Background color<input className="h-9 w-full" type="color" value={colorToHex(recipe.background.color)} onChange={event => changeRecipe(draft => { draft.background.color = hexToColor(event.target.value); })} /></FieldLabel>
                  <UiButton size="sm" variant={tool === 'eyedropper' ? 'default' : 'outline'} onClick={() => { setTool('eyedropper'); setPreviewMode('original'); }}>Pick from image</UiButton>
                  <FieldLabel>Tolerance: {recipe.background.tolerance.toFixed(3)}<UiSlider min={0} max={0.25} step={0.002} value={[recipe.background.tolerance]} onValueChange={value => changeRecipe(draft => { draft.background.tolerance = value[0] ?? draft.background.tolerance; })} /></FieldLabel>
                  <FieldLabel>Soft edge: {recipe.background.softness.toFixed(3)}<UiSlider min={0.002} max={0.25} step={0.002} value={[recipe.background.softness]} onValueChange={value => changeRecipe(draft => { draft.background.softness = value[0] ?? draft.background.softness; })} /></FieldLabel>
                  <FieldLabel>Despill: {recipe.background.despill.toFixed(2)}<UiSlider min={0} max={1} step={0.02} value={[recipe.background.despill]} onValueChange={value => changeRecipe(draft => { draft.background.despill = value[0] ?? draft.background.despill; })} /></FieldLabel>
                  <FieldLabel>Detection alpha: {recipe.detection.alphaThreshold}<UiSlider min={1} max={254} step={1} value={[recipe.detection.alphaThreshold]} onValueChange={value => changeRecipe(draft => { draft.detection.alphaThreshold = value[0] ?? draft.detection.alphaThreshold; })} /></FieldLabel>
                  <FieldLabel>Opening radius: {recipe.detection.openingRadius}px<UiSlider min={0} max={8} step={1} value={[recipe.detection.openingRadius]} onValueChange={value => changeRecipe(draft => { draft.detection.openingRadius = value[0] ?? draft.detection.openingRadius; })} /></FieldLabel>
                  <FieldLabel>Closing radius: {recipe.detection.closingRadius}px<UiSlider min={0} max={8} step={1} value={[recipe.detection.closingRadius]} onValueChange={value => changeRecipe(draft => { draft.detection.closingRadius = value[0] ?? draft.detection.closingRadius; })} /></FieldLabel>
                  <FieldLabel>Minimum island: {(recipe.detection.minimumRegionAreaRatio * 100).toFixed(3)}%<UiSlider min={0} max={0.01} step={0.00005} value={[recipe.detection.minimumRegionAreaRatio]} onValueChange={value => changeRecipe(draft => { draft.detection.minimumRegionAreaRatio = value[0] ?? draft.detection.minimumRegionAreaRatio; })} /></FieldLabel>
                  {result && result.background.confidence < 0.55 && <p className="rounded bg-amber-500/10 p-2 text-xs text-amber-500">Low border-color confidence. Pick the background color manually.</p>}
                </> : <>
                  <div className="grid grid-cols-2 gap-2">
                    <UiButton size="sm" variant={tool === 'select' ? 'default' : 'outline'} onClick={() => setTool('select')}><MousePointer2 className="mr-1 h-4 w-4" />Select</UiButton>
                    <UiButton size="sm" variant={tool === 'foreground' ? 'default' : 'outline'} onClick={() => setTool('foreground')}><Paintbrush className="mr-1 h-4 w-4" />Keep</UiButton>
                    <UiButton size="sm" variant={tool === 'background' ? 'default' : 'outline'} onClick={() => setTool('background')}><Eraser className="mr-1 h-4 w-4" />Erase</UiButton>
                    <UiButton size="sm" variant={tool === 'split' ? 'default' : 'outline'} onClick={() => setTool('split')}><Scissors className="mr-1 h-4 w-4" />Split</UiButton>
                  </div>
                  <FieldLabel>Brush radius: {(brushRadius * 100).toFixed(1)}%<UiSlider min={0.002} max={0.08} step={0.002} value={[brushRadius]} onValueChange={value => setBrushRadius(value[0] ?? brushRadius)} /></FieldLabel>
                  <UiButton className="w-full" size="sm" variant="outline" disabled={selectedRegionIds.size < 2} onClick={mergeSelected}><Merge className="mr-1 h-4 w-4" />Merge selected</UiButton>
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-xs" value={assignmentPartKey} onChange={event => setAssignmentPartKey(event.target.value)}>
                    <option value="">Assign to part…</option>
                    {parts.map(part => <option key={part.partKey} value={part.partKey}>{part.name}</option>)}
                  </select>
                  <UiButton className="w-full" size="sm" variant="outline" disabled={!assignmentPartKey || selectedRegionIds.size === 0} onClick={assignSelected}>Assign selected</UiButton>
                  <UiButton className="w-full" size="sm" variant="destructive" disabled={selectedRegionIds.size === 0} onClick={deleteSelected}>Ignore selected</UiButton>
                  <p className="text-xs text-muted-foreground">Shift-click to select multiple regions. Split affects detection only; exported alpha remains continuous.</p>
                </>}
                <div className="flex gap-2 border-t pt-3"><UiButton size="icon" variant="outline" disabled={!history.length} onClick={undoLocal}><Undo2 className="h-4 w-4" /></UiButton><UiButton size="icon" variant="outline" disabled={!future.length} onClick={redoLocal}><Redo2 className="h-4 w-4" /></UiButton></div>
              </aside>
              <section className="flex min-h-0 flex-col rounded-lg border bg-black/40">
                <div className="flex gap-1 border-b bg-background p-2">
                  {(['original', 'matte', 'result'] as const).map(mode => <UiButton key={mode} size="sm" variant={previewMode === mode ? 'default' : 'ghost'} onClick={() => setPreviewMode(mode)}>{mode}</UiButton>)}
                  <UiButton size="sm" variant="ghost" onClick={() => setZoom(value => Math.max(0.25, value - 0.25))}>−</UiButton>
                  <span className="self-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
                  <UiButton size="sm" variant="ghost" onClick={() => setZoom(value => Math.min(4, value + 0.25))}>+</UiButton>
                  <span className="ml-auto self-center text-xs text-muted-foreground">{busy ? `Processing ${Math.round(progress * 100)}%` : `${result?.regions.length ?? 0} regions`}</span>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
                  <ModularSpritePreviewCanvas source={previewSource} result={result} mode={previewMode} tool={tool} zoom={zoom} selectedRegionIds={selectedRegionIds} onSelectRegion={(regionId, additive) => setSelectedRegionIds(previous => {
                    if (!regionId) return new Set();
                    const next = additive ? new Set(previous) : new Set<number>();
                    if (next.has(regionId)) next.delete(regionId); else next.add(regionId);
                    return next;
                  })} onPickColor={color => { changeRecipe(draft => { draft.background.mode = 'chroma'; draft.background.color = color; }); setTool('select'); }} onStroke={(kind, points) => changeRecipe(draft => { draft.strokes.push({ kind, radius: brushRadius, points }); })} />
                </div>
              </section>
            </div>
          )}

          {step === 'parts' && <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Suggestions are not accepted automatically. Review and confirm each anatomical assignment.</p>
            {parts.map((part, index) => <div key={`${part.partKey}-${index}`} className="space-y-3 rounded-lg border p-3">
              <div className="grid grid-cols-[1fr_1fr_1fr_130px_90px_90px] items-end gap-2">
                <FieldLabel>Name<UiInput value={part.name} onChange={event => updatePart(index, { name: event.target.value })} /></FieldLabel>
                <FieldLabel>Stable key<UiInput value={part.partKey} onChange={event => updatePart(index, { partKey: slug(event.target.value) })} /></FieldLabel>
                <FieldLabel>Role<select className="h-10 rounded-md border bg-background px-2" value={part.role} onChange={event => updatePart(index, { role: event.target.value })}>{ROLES.map(role => <option key={role}>{role}</option>)}</select></FieldLabel>
                <FieldLabel>Anatomical side<select className="h-10 rounded-md border bg-background px-2" value={part.side} onChange={event => updatePart(index, { side: event.target.value as ModularSpriteDraftPart['side'] })}><option value="none">none</option><option value="left">left</option><option value="right">right</option><option value="center">center</option></select></FieldLabel>
                <FieldLabel>Order<UiInput type="number" value={part.order} onChange={event => updatePart(index, { order: Number(event.target.value) })} /></FieldLabel>
                <div className="grid gap-1"><label className="flex h-5 items-center gap-2 text-xs"><input type="checkbox" checked={part.required} onChange={event => updatePart(index, { required: event.target.checked })} />Required</label><UiButton size="sm" variant={confirmedKeys.has(part.partKey) ? 'outline' : 'default'} onClick={() => setConfirmedKeys(previous => new Set(previous).add(part.partKey))}><Check className="mr-1 h-3 w-3" />{confirmedKeys.has(part.partKey) ? 'Confirmed' : 'Confirm'}</UiButton></div>
              </div>
              <div className="grid grid-cols-[repeat(4,1fr)_auto] items-end gap-2 border-t pt-2">
                {(['x', 'y', 'width', 'height'] as const).map(field => <FieldLabel key={field}>Frame {field}
                  <UiInput type="number" min={0} max={1} step={0.001} value={part.extractionFrame[field]} onChange={event => updateExtractionFrame(index, field, Number(event.target.value))} />
                </FieldLabel>)}
                <UiButton type="button" variant="destructive" onClick={() => removePart(index)}>Remove part</UiButton>
              </div>
            </div>)}
          </div>}

          {step === 'review' && <div className="mx-auto grid max-w-2xl gap-5">
            <FieldLabel>Set and folder name<UiInput value={name} onChange={event => { setName(event.target.value); send({ type: 'CHANGE' }); }} /></FieldLabel>
            <label className="flex items-center gap-3 rounded-lg border p-4 text-sm"><input type="checkbox" checked={addToCanvas} onChange={event => setAddToCanvas(event.target.checked)} />Add arranged parts to canvas</label>
            <div className="rounded-lg border p-4"><div className="font-medium">{parts.length} parts ready</div><ul className="mt-2 grid grid-cols-2 gap-1 text-sm text-muted-foreground">{[...parts].sort((a, b) => a.order - b.order).map(part => <li key={part.partKey}>{part.name} · {part.role} · {part.side}</li>)}</ul></div>
            {file?.type === 'image/jpeg' && <p className="rounded bg-amber-500/10 p-3 text-sm text-amber-500">JPEG compression can leave a colored halo around extracted parts.</p>}
          </div>}

          {(step === 'failure' || error) && <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error ?? machine.context.error}</p>}
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
