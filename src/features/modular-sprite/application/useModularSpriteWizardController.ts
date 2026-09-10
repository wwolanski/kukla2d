import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import type {
  ModularSpriteDocument,
  ModularSpriteId,
  ModularSpriteMaskStrokeKind,
  ModularSpriteProcessingRecipe,
  NormalizedPoint,
} from "@kukla2d/contracts";
import { MODULAR_SPRITE_PROCESSING_CONFIG } from "@kukla2d/contracts";
import type {
  MatchProgressEvent,
  ModularSpriteSchema,
  SchemaComparisonResult,
  SchemaMatchRequest,
  SchemaMatchResponse,
  SemanticCatalog,
} from "@kukla2d/modular-sprite-schema";

import { finalizeModularSpriteImport } from "./finalizeModularSpriteImport.js";
import {
  createDraftPart,
  createEmptyDraftPart,
  partKeyForName,
} from "./partDraftFactory.js";
import { groupingFromSchemaMatch } from "./schemaBinding.js";
import {
  canContinue,
  createInitialWizardState,
  hasUnsavedChanges,
  isWizardBusy,
  wizardReducer,
} from "./wizardState.js";
import { matchRegionsToTemplate } from "../domain/matching.js";
import {
  createInitialGrouping,
  excludeRegions,
  moveRegionsToPart,
  renamePart,
} from "../domain/partGrouping.js";
import { analyzeModularSpriteBackground } from "../domain/processing/backgroundAnalysis.js";
import { reconcileRegionGrouping } from "../domain/regionReconciliation.js";

import type {
  ModularSpriteProcessingPort,
  ModularSpriteSchemaPort,
} from "./finalizeModularSpriteImport.types.js";
import type { ModularSpriteCommitRequest } from "./importContracts.types.js";
import type { WizardState } from "./wizardState.types.js";
import type {
  DetectedRegion,
  ModularSpriteDraftPart,
  ProcessedModularSprite,
  RgbaImageData,
} from "../domain/contracts.types.js";
import type { RegionGrouping } from "../domain/partGrouping.types.js";

interface ModularSpriteProcessingControllerPort extends ModularSpriteProcessingPort {
  warm(image: RgbaImageData): Promise<void>;
  onProgress?(
    listener: (progress: { progress: number; stage: string }) => void,
  ): () => void;
  cancel(): void;
  dispose(): void;
}

interface ModularSpriteImageControllerPort {
  decode(file: File): Promise<RgbaImageData>;
  preview(image: RgbaImageData): RgbaImageData;
  encode(image: RgbaImageData): Promise<Blob>;
}

interface ModularSpriteSchemaControllerPort extends ModularSpriteSchemaPort {
  initialize(): Promise<void>;
  list(): ModularSpriteSchema[];
  match(
    request: SchemaMatchRequest,
    options?: {
      signal?: AbortSignal;
      onProgress?: (event: MatchProgressEvent) => void;
    },
  ): Promise<SchemaMatchResponse>;
  semantics?: SemanticCatalog;
}

interface ModularSpriteExistingSource {
  file: File;
  document: ModularSpriteDocument;
}

interface ModularSpriteWizardControllerPorts {
  image: ModularSpriteImageControllerPort;
  processing: ModularSpriteProcessingControllerPort;
  schema: ModularSpriteSchemaControllerPort;
  resolveExisting?: (
    id: ModularSpriteId,
  ) => Promise<ModularSpriteExistingSource>;
}

interface ModularSpriteWizardControllerProps {
  open: boolean;
  existingId?: ModularSpriteId | null;
  onOpenChange: (open: boolean) => void;
  onCommit: (request: ModularSpriteCommitRequest) => Promise<unknown>;
  ports: ModularSpriteWizardControllerPorts;
  confirmDiscard?: () => boolean;
}

type PreviewMode = "original" | "matte" | "result";
type EditorTool =
  "select" | "eyedropper" | "enclosed-fill" | ModularSpriteMaskStrokeKind;

interface RegionAssignment {
  color: string;
  name: string;
}

interface ModularSpriteWizardController {
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
    showProtectedInteriors: boolean;
    setShowProtectedInteriors: (value: boolean) => void;
    selectedRegionIds: ReadonlySet<number>;
  };
  assignments: ReadonlyMap<number, RegionAssignment>;
  busy: boolean;
  canGoNext: boolean;
  loadFile: (
    file: File,
    existingDocument?: ModularSpriteDocument,
  ) => Promise<void>;
  changeRecipe: (
    change: (recipe: ModularSpriteProcessingRecipe) => void,
    kind?: "recipe" | "discrete" | "parts",
    process?: boolean,
  ) => void;
  commitRecipeProcessing: () => void;
  updatePart: (index: number, change: Partial<ModularSpriteDraftPart>) => void;
  createPart: () => void;
  moveRegionsToPart: (
    regionIds: readonly number[],
    targetPartKey: string,
  ) => void;
  excludeRegions: (regionIds: readonly number[]) => void;
  toggleRegionSelection: (regionId: number, additive: boolean) => void;
  undo: () => void;
  redo: () => void;
  applySchemaMatch: (match: SchemaComparisonResult) => void;
  setAutoMatch: (value: boolean) => void;
  setSchemaEditor: (
    value: Partial<
      Pick<WizardState["schema"], "addSchema" | "saveMode" | "metadata">
    >,
  ) => void;
  setName: (name: string) => void;
  setAddToCanvas: (value: boolean) => void;
  next: () => void;
  back: () => void;
  finalize: () => Promise<void>;
  reset: () => void;
  requestClose: () => boolean;
}

const PART_COLORS = [
  "#38bdf8",
  "#f472b6",
  "#a3e635",
  "#fbbf24",
  "#c084fc",
  "#fb7185",
  "#4ade80",
  "#fb923c",
  "#2dd4bf",
  "#e879f9",
];

function nearestRegionId(
  point: NormalizedPoint,
  regions: readonly DetectedRegion[],
  used: Set<number>,
): number | null {
  let best: DetectedRegion | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const region of regions) {
    if (used.has(region.id)) continue;
    const distance = Math.hypot(
      point.x - region.centroid.x,
      point.y - region.centroid.y,
    );
    if (distance < bestDistance) {
      best = region;
      bestDistance = distance;
    }
  }
  if (!best || bestDistance > 0.2) return null;
  used.add(best.id);
  return best.id;
}

function existingGrouping(
  document: ModularSpriteDocument,
  result: ProcessedModularSprite,
): RegionGrouping {
  const used = new Set<number>();
  const fallback = matchRegionsToTemplate(
    document.parts.map((part) => ({
      partKey: part.partKey,
      required: part.required,
      contentBounds: part.contentBounds,
    })),
    result.regions,
  );
  const parts = document.parts.map((part) => {
    const ids = part.componentSeeds
      .map((seed) => nearestRegionId(seed, result.regions, used))
      .filter((regionId): regionId is number => regionId !== null);
    if (ids.length === 0) {
      const match = fallback.find(
        (candidate) => candidate.partKey === part.partKey,
      );
      if (
        match &&
        match.confidence >= 0.55 &&
        match.regionId !== null &&
        !used.has(match.regionId)
      ) {
        used.add(match.regionId);
        ids.push(match.regionId);
      }
    }
    return { ...structuredClone(part), regionIds: [...new Set(ids)] };
  });
  return {
    parts,
    excludedRegionIds: result.regions
      .map((region) => region.id)
      .filter((regionId) => !used.has(regionId)),
  };
}

function partFactoryFor(result: ProcessedModularSprite | null) {
  return (
    region: DetectedRegion,
    index: number,
    parts: readonly ModularSpriteDraftPart[],
  ) =>
    createDraftPart(
      region,
      result?.width ?? 1,
      result?.height ?? 1,
      index,
      parts,
    );
}

function colorForPart(
  parts: readonly ModularSpriteDraftPart[],
  partKey: string,
): string {
  const index = parts.findIndex((part) => part.partKey === partKey);
  return PART_COLORS[(index < 0 ? 0 : index) % PART_COLORS.length]!;
}

export function useModularSpriteWizardController({
  open,
  existingId = null,
  onOpenChange,
  onCommit,
  ports,
  confirmDiscard,
}: ModularSpriteWizardControllerProps): ModularSpriteWizardController {
  const [state, dispatch] = useReducer(
    wizardReducer,
    undefined,
    createInitialWizardState,
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const resultRef = useRef<ProcessedModularSprite | null>(null);
  const processGeneration = useRef(0);
  const loadedExistingId = useRef<string | null>(null);
  const lastAutoApplied = useRef("");
  const [resultVersion, setResultVersion] = useState(0);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("result");
  const [tool, setTool] = useState<EditorTool>("select");
  const [brushRadius, setBrushRadius] = useState<number>(
    MODULAR_SPRITE_PROCESSING_CONFIG.strokes.editorRadius.default,
  );
  const [zoom, setZoom] = useState(1);
  const [showOverlays, setShowOverlays] = useState(true);
  const [showProtectedInteriors, setShowProtectedInteriors] = useState(false);
  const [selectedRegionIds, setSelectedRegionIds] = useState<Set<number>>(
    new Set(),
  );

  useEffect(
    () =>
      ports.processing.onProgress?.((update) =>
        dispatch({
          type: "PROCESSING_PROGRESS",
          value: update.progress,
          stage: update.stage,
        }),
      ),
    [ports.processing],
  );

  const reset = useCallback(() => {
    processGeneration.current += 1;
    ports.processing.cancel();
    resultRef.current = null;
    setResultVersion((version) => version + 1);
    setSelectedRegionIds(new Set());
    setPreviewMode("result");
    setTool("select");
    setZoom(1);
    setShowProtectedInteriors(false);
    dispatch({ type: "RESET" });
  }, [ports.processing]);

  useEffect(
    () => () => {
      processGeneration.current += 1;
      ports.processing.dispose();
    },
    [ports.processing],
  );

  const loadFile = useCallback(
    async (
      nextFile: File,
      existingDocument?: ModularSpriteDocument,
    ): Promise<void> => {
      dispatch({ type: "SOURCE_SELECTED" });
      try {
        const decoded = await ports.image.decode(nextFile);
        const preview = ports.image.preview(decoded);
        const detected = analyzeModularSpriteBackground(preview);
        const recipe = existingDocument?.recipe ?? {
          ...structuredClone(stateRef.current.recipe),
          background: {
            ...stateRef.current.recipe.background,
            mode: detected.mode,
            color: detected.color,
          },
        };
        await ports.processing.warm(preview);
        const source = {
          file: nextFile,
          image: decoded,
          preview,
          ...(existingDocument ? { existingDocument } : {}),
        };
        dispatch({
          type: "SOURCE_LOADED",
          source,
          recipe,
          name:
            existingDocument?.name ??
            (nextFile.name.replace(/\.[^.]+$/, "") || "Modular Sprite"),
          ...(existingDocument ? { existingId: existingDocument.id } : {}),
        });
      } catch (loadError) {
        dispatch({
          type: "LOAD_FAILED",
          message:
            loadError instanceof Error
              ? loadError.message
              : "Could not decode the image",
        });
      }
    },
    [ports.image, ports.processing],
  );

  useEffect(() => {
    if (
      !open ||
      !existingId ||
      loadedExistingId.current === existingId ||
      !ports.resolveExisting
    )
      return;
    loadedExistingId.current = existingId;
    void ports
      .resolveExisting(existingId)
      .then((existing) => loadFile(existing.file, existing.document))
      .catch((error) =>
        dispatch({
          type: "LOAD_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Could not open the source image",
        }),
      );
  }, [existingId, loadFile, open, ports.resolveExisting]);

  useEffect(() => {
    if (!open || existingId) return;
    loadedExistingId.current = null;
  }, [existingId, open]);

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    void ports.schema
      .initialize()
      .then(() => {
        if (!ignore)
          dispatch({
            type: "SCHEMA_CATALOG_LOADED",
            schemas: ports.schema.list(),
          });
      })
      .catch((error) => {
        if (!ignore)
          dispatch({
            type: "SCHEMA_MATCHING_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Could not load schema catalog",
          });
      });
    return () => {
      ignore = true;
    };
  }, [open, ports.schema]);

  useEffect(() => {
    const source = state.source;
    if (!open || !source) return;
    const generation = ++processGeneration.current;
    const timeout = window.setTimeout(() => {
      dispatch({ type: "PROCESSING_STARTED" });
      const recipe = structuredClone(stateRef.current.recipe);
      const run = ports.processing.process({ recipe }).catch((error) => {
        if (error instanceof Error && error.message.includes("not warmed up"))
          return ports.processing.process({ image: source.preview, recipe });
        throw error;
      });
      void run
        .then((nextResult) => {
          if (generation !== processGeneration.current) return;
          const current = stateRef.current;
          const previousResult = current.processingResult;
          let grouping: RegionGrouping;
          if (!current.grouping) {
            grouping = source.existingDocument
              ? existingGrouping(source.existingDocument, nextResult)
              : createInitialGrouping(nextResult, partFactoryFor(nextResult));
          } else if (previousResult) {
            grouping = reconcileRegionGrouping(
              current.grouping,
              previousResult.regions,
              nextResult.regions,
            ).grouping;
          } else {
            grouping = structuredClone(current.grouping);
          }
          resultRef.current = nextResult;
          setResultVersion((version) => version + 1);
          dispatch({
            type: "PROCESSING_SUCCEEDED",
            result: nextResult,
            grouping,
          });
        })
        .catch((error) => {
          if (
            generation !== processGeneration.current ||
            (error instanceof DOMException && error.name === "AbortError")
          )
            return;
          dispatch({
            type: "PROCESSING_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Image processing failed",
          });
        });
    }, 60);
    return () => {
      window.clearTimeout(timeout);
      ports.processing.cancel();
    };
  }, [open, ports.processing, state.processingRevision, state.source]);

  useEffect(() => {
    const result = state.processingResult;
    if (
      !open ||
      !state.schema.autoMatch ||
      !result ||
      state.schema.schemas.length === 0
    )
      return;
    const controller = new AbortController();
    let ignore = false;
    dispatch({
      type: "SCHEMA_MATCHING_STARTED",
      total: state.schema.schemas.length,
    });
    const requestId = crypto.randomUUID();
    void ports.schema
      .match(
        {
          requestId,
          observation: result.observation,
          matcherProfileId: "default-v1",
        },
        {
          signal: controller.signal,
          onProgress: (event) => {
            if (!ignore)
              dispatch({
                type: "SCHEMA_PROGRESS",
                completed: event.completed,
                total: event.total,
              });
          },
        },
      )
      .then((response) => {
        if (ignore) return;
        dispatch({
          type: "SCHEMA_MATCHES_RECEIVED",
          matches: response.matches,
        });
        const best = response.matches[0];
        const autoKey = `${resultVersion}:${best?.schemaId ?? ""}`;
        if (
          best?.confidence === "high" &&
          !stateRef.current.groupingTouched &&
          lastAutoApplied.current !== autoKey
        ) {
          lastAutoApplied.current = autoKey;
          const schema = stateRef.current.schema.schemas.find(
            (item) =>
              item.schemaId === best.schemaId &&
              item.revision === best.schemaRevision,
          );
          if (schema) {
            const grouping = groupingFromSchemaMatch(
              result,
              schema,
              best,
              (region, index, parts) =>
                createDraftPart(
                  region,
                  result.width,
                  result.height,
                  index,
                  parts,
                ),
              ports.schema.semantics,
            );
            dispatch({ type: "SCHEMA_APPLIED", schema, match: best, grouping });
          }
        }
      })
      .catch((error) => {
        if (
          !ignore &&
          !(error instanceof DOMException && error.name === "AbortError")
        )
          dispatch({
            type: "SCHEMA_MATCHING_FAILED",
            message:
              error instanceof Error ? error.message : "Schema matching failed",
          });
      })
      .finally(() => {
        if (!ignore) dispatch({ type: "SCHEMA_MATCHING_FINISHED" });
      });
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [
    open,
    ports.schema,
    resultVersion,
    state.processingResult,
    state.schema.autoMatch,
    state.schema.schemas,
  ]);

  const changeRecipe = useCallback(
    (
      change: (recipe: ModularSpriteProcessingRecipe) => void,
      kind: "recipe" | "discrete" | "parts" = "recipe",
      process = true,
    ): void => {
      const recipe = structuredClone(stateRef.current.recipe);
      change(recipe);
      dispatch({ type: "RECIPE_CHANGED", recipe, kind, process });
    },
    [],
  );

  const commitRecipeProcessing = useCallback(
    () => dispatch({ type: "REPROCESS_REQUESTED" }),
    [],
  );

  const updatePart = useCallback(
    (index: number, change: Partial<ModularSpriteDraftPart>): void => {
      const grouping = stateRef.current.grouping;
      const current = grouping?.parts[index];
      if (!grouping || !current) return;
      const next =
        change.name !== undefined
          ? renamePart(grouping, current.partKey, change.name).grouping
          : structuredClone(grouping);
      const target = next.parts[index];
      if (!target) return;
      const otherChanges: Partial<ModularSpriteDraftPart> = { ...change };
      delete otherChanges.name;
      delete otherChanges.partKey;
      Object.assign(target, structuredClone(otherChanges));
      if (change.name !== undefined)
        target.partKey = partKeyForName(
          change.name,
          grouping.parts,
          current.partKey,
        );
      dispatch({
        type: "GROUPING_CHANGED",
        grouping: next,
      });
    },
    [],
  );

  const updateGrouping = useCallback((next: RegionGrouping): void => {
    dispatch({
      type: "GROUPING_CHANGED",
      grouping: next,
    });
  }, []);

  const createPart = useCallback((): void => {
    const grouping = stateRef.current.grouping;
    if (!grouping) return;
    const part = createEmptyDraftPart(grouping.parts.length, grouping.parts);
    updateGrouping({
      parts: [...grouping.parts, part],
      excludedRegionIds: [...grouping.excludedRegionIds],
    });
  }, [updateGrouping]);

  const moveRegionsToPartCommand = useCallback(
    (regionIds: readonly number[], targetPartKey: string): void => {
      const grouping = stateRef.current.grouping;
      const result = stateRef.current.processingResult;
      if (!grouping || !result || regionIds.length === 0) return;
      const changed = moveRegionsToPart(grouping, regionIds, targetPartKey, {
        regions: result.regions,
        dimensions: { width: result.width, height: result.height },
      });
      updateGrouping(changed.grouping);
      setSelectedRegionIds((previous) => {
        const next = new Set(previous);
        for (const regionId of regionIds) next.delete(regionId);
        return next;
      });
    },
    [updateGrouping],
  );

  const excludeRegionsCommand = useCallback(
    (regionIds: readonly number[]): void => {
      const grouping = stateRef.current.grouping;
      if (!grouping || regionIds.length === 0) return;
      const changed = excludeRegions(grouping, regionIds);
      updateGrouping(changed.grouping);
      setSelectedRegionIds((previous) => {
        const next = new Set(previous);
        for (const regionId of regionIds) next.delete(regionId);
        return next;
      });
    },
    [updateGrouping],
  );

  const toggleRegionSelection = useCallback(
    (regionId: number, additive: boolean): void => {
      setSelectedRegionIds((previous) => {
        if (!regionId) return additive ? previous : new Set();
        const next = additive ? new Set(previous) : new Set<number>();
        if (next.has(regionId)) next.delete(regionId);
        else next.add(regionId);
        return next;
      });
    },
    [],
  );

  const applySchemaMatch = useCallback(
    (match: SchemaComparisonResult): void => {
      const result = stateRef.current.processingResult;
      const schema = stateRef.current.schema.schemas.find(
        (item) =>
          item.schemaId === match.schemaId &&
          item.revision === match.schemaRevision,
      );
      if (!result || !schema) return;
      const grouping = groupingFromSchemaMatch(
        result,
        schema,
        match,
        (region, index, parts) =>
          createDraftPart(region, result.width, result.height, index, parts),
        ports.schema.semantics,
      );
      dispatch({ type: "SCHEMA_APPLIED", schema, match, grouping });
    },
    [ports.schema.semantics],
  );

  const assignments = useMemo(() => {
    const map = new Map<number, RegionAssignment>();
    for (const part of state.grouping?.parts ?? [])
      for (const regionId of part.regionIds)
        map.set(regionId, {
          color: colorForPart(state.grouping?.parts ?? [], part.partKey),
          name: part.name,
        });
    return map;
  }, [state.grouping]);

  const finalize = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (!current.source || !current.processingResult || !current.grouping)
      return;
    dispatch({ type: "FINALIZATION_STARTED" });
    try {
      const outcome = await finalizeModularSpriteImport(
        {
          existingId: current.existingId,
          source: current.source,
          recipe: current.recipe,
          previewResult: current.processingResult,
          grouping: current.grouping,
          name: current.name,
          addToCanvas: current.addToCanvas,
          schema: {
            applied: current.schema.applied,
            addSchema: current.schema.addSchema,
            saveMode: current.schema.saveMode,
            metadata: current.schema.metadata,
          },
        },
        {
          processing: ports.processing,
          image: ports.image,
          schema: ports.schema,
        },
      );
      await onCommit(outcome.request);
      if (outcome.schema)
        dispatch({
          type: "SCHEMA_CATALOG_LOADED",
          schemas: ports.schema.list(),
        });
      dispatch({ type: "FINALIZATION_SUCCEEDED" });
      reset();
      onOpenChange(false);
    } catch (error) {
      dispatch({
        type: "FINALIZATION_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Could not import the modular sprite",
      });
    }
  }, [
    onCommit,
    onOpenChange,
    ports.image,
    ports.processing,
    ports.schema,
    reset,
  ]);

  const requestClose = useCallback((): boolean => {
    if (hasUnsavedChanges(stateRef.current) && !(confirmDiscard?.() ?? true))
      return false;
    reset();
    loadedExistingId.current = null;
    onOpenChange(false);
    return true;
  }, [confirmDiscard, onOpenChange, reset]);

  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);
  const setAutoMatch = useCallback(
    (value: boolean) => dispatch({ type: "SET_AUTO_MATCH", value }),
    [],
  );
  const setSchemaEditor = useCallback(
    (
      value: Partial<
        Pick<WizardState["schema"], "addSchema" | "saveMode" | "metadata">
      >,
    ) => dispatch({ type: "SET_SCHEMA_EDITOR", value }),
    [],
  );
  const setName = useCallback(
    (name: string) => dispatch({ type: "SET_NAME", name }),
    [],
  );
  const setAddToCanvas = useCallback(
    (value: boolean) => dispatch({ type: "SET_ADD_TO_CANVAS", value }),
    [],
  );
  const next = useCallback(() => dispatch({ type: "NEXT" }), []);
  const back = useCallback(() => dispatch({ type: "BACK" }), []);

  return {
    state,
    resultRef,
    resultVersion,
    ui: {
      previewMode,
      setPreviewMode,
      tool,
      setTool,
      brushRadius,
      setBrushRadius,
      zoom,
      setZoom,
      showOverlays,
      setShowOverlays,
      showProtectedInteriors,
      setShowProtectedInteriors,
      selectedRegionIds,
    },
    assignments,
    busy: isWizardBusy(state),
    canGoNext: canContinue(state),
    loadFile,
    changeRecipe,
    commitRecipeProcessing,
    updatePart,
    createPart,
    moveRegionsToPart: moveRegionsToPartCommand,
    excludeRegions: excludeRegionsCommand,
    toggleRegionSelection,
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
