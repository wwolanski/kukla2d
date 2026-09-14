import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  AlertTriangle,
  Check,
  Image as ImageIcon,
  Link2,
  Search,
  Sparkles,
  Unlink,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useProjectStore } from "@/store/projectStore";

import {
  applyTextureReplacements,
  autoPairTextures,
  collectTextureReplacementCandidates,
  collectTextureReplacementSources,
} from "@/features/texture-replacement/domain/textureReplacement.js";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";

const DRAG_TYPE = "application/x-kukla-texture-replacement";

function loadDimensions(texture) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve([
        texture.id,
        {
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
        },
      ]);
    image.onerror = () => resolve([texture.id, null]);
    image.src = texture.source;
  });
}

function TextureThumb({ texture, name, muted = false }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/30 ${muted ? "grayscale opacity-40" : ""}`}
    >
      {texture?.source ? (
        <img
          src={texture.source}
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
        />
      ) : (
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}

function SizeLabel({ dimensions }) {
  return dimensions ? (
    <span className="tabular-nums">
      {dimensions.width} × {dimensions.height}
    </span>
  ) : (
    <span>size unavailable</span>
  );
}

function PairReason({ reason }) {
  if (!reason) return null;
  const labels = {
    "exact-name": "Exact name",
    "similar-name": "Similar name",
    "same-size": "Same size",
  };
  return (
    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">
      {labels[reason]}
    </span>
  );
}

function readDrag(event) {
  try {
    return JSON.parse(event.dataTransfer.getData(DRAG_TYPE));
  } catch {
    return null;
  }
}

function writeDrag(event, value) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(value));
}

export function TextureReplacementModal({ open, onOpenChange }) {
  const project = useProjectStore((state) => state.project);
  const updateProject = useProjectStore((state) => state.updateProject);
  const { toast } = useToast();
  const [pairs, setPairs] = useState([]);
  const [dimensions, setDimensions] = useState(() => new Map());
  const [failedTextureIds, setFailedTextureIds] = useState(() => new Set());
  const [loadingDimensions, setLoadingDimensions] = useState(false);
  const [preserveDeformation, setPreserveDeformation] = useState(true);
  const [autoFit, setAutoFit] = useState(true);
  const [search, setSearch] = useState("");

  const sources = useMemo(
    () => collectTextureReplacementSources(project),
    [project],
  );
  const candidates = useMemo(
    () => collectTextureReplacementCandidates(project),
    [project],
  );
  const textureMap = useMemo(
    () => new Map(project.textures.map((texture) => [texture.id, texture])),
    [project.textures],
  );
  const dimensionsWithSources = useMemo(() => {
    const next = new Map(dimensions);
    for (const source of sources) {
      if (source.width && source.height && !next.has(source.textureId)) {
        next.set(source.textureId, {
          width: source.width,
          height: source.height,
        });
      }
    }
    return next;
  }, [dimensions, sources]);

  const enrichedSources = useMemo(
    () =>
      sources.map((source) => ({
        ...source,
        ...dimensionsWithSources.get(source.textureId),
      })),
    [dimensionsWithSources, sources],
  );
  const enrichedCandidates = useMemo(
    () =>
      candidates.map((candidate) => ({
        ...candidate,
        ...dimensionsWithSources.get(candidate.textureId),
      })),
    [candidates, dimensionsWithSources],
  );

  useEffect(() => {
    if (!open) return undefined;
    setPairs(autoPairTextures(enrichedSources, enrichedCandidates));
    setPreserveDeformation(true);
    setAutoFit(true);
    setSearch("");
    setFailedTextureIds(new Set());

    let cancelled = false;
    setLoadingDimensions(true);
    Promise.all(project.textures.map(loadDimensions)).then((entries) => {
      if (cancelled) return;
      const nextDimensions = new Map();
      const failed = new Set();
      for (const [textureId, value] of entries) {
        if (value) nextDimensions.set(textureId, value);
        else failed.add(textureId);
      }
      setDimensions(nextDimensions);
      setFailedTextureIds(failed);
      setLoadingDimensions(false);
    });
    return () => {
      cancelled = true;
    };
    // Opening creates a fresh draft. Project changes while open do not overwrite user pairing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const assignedTextureIds = useMemo(
    () => new Set(pairs.map((pair) => pair.textureId).filter(Boolean)),
    [pairs],
  );
  const availableCandidates = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return enrichedCandidates.filter(
      (candidate) =>
        !assignedTextureIds.has(candidate.textureId) &&
        (!query || candidate.name.toLocaleLowerCase().includes(query)),
    );
  }, [assignedTextureIds, enrichedCandidates, search]);
  const activePairCount = pairs.filter(
    (pair) =>
      pair.enabled && pair.textureId && !failedTextureIds.has(pair.textureId),
  ).length;
  const meshPairCount = pairs.filter(
    (pair) =>
      pair.enabled &&
      pair.textureId &&
      project.nodes.find((node) => node.id === pair.nodeId)?.mesh,
  ).length;
  const aspectMismatchCount = pairs.filter((pair, index) => {
    if (!pair.enabled || !pair.textureId) return false;
    const source = dimensionsWithSources.get(sources[index]?.textureId);
    const target = dimensionsWithSources.get(pair.textureId);
    if (!source || !target || source.height === 0 || target.height === 0)
      return false;
    return (
      Math.abs(
        source.width / source.height / (target.width / target.height) - 1,
      ) > 0.05
    );
  }).length;

  const assignTexture = (slotIndex, textureId) => {
    if (failedTextureIds.has(textureId)) return;
    setPairs((current) =>
      current.map((pair, index) => {
        if (index === slotIndex)
          return { ...pair, textureId, enabled: true, reason: undefined };
        if (pair.textureId === textureId)
          return {
            ...pair,
            textureId: null,
            enabled: false,
            reason: undefined,
          };
        return pair;
      }),
    );
  };

  const assignFirstEmpty = (textureId) => {
    const index = pairs.findIndex((pair) => !pair.textureId);
    if (index >= 0) assignTexture(index, textureId);
  };

  const swapTargets = (fromIndex, toIndex) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= pairs.length ||
      toIndex >= pairs.length
    )
      return;
    setPairs((current) => {
      const next = current.map((pair) => ({ ...pair }));
      const from = next[fromIndex];
      const to = next[toIndex];
      const fromTarget = {
        textureId: from.textureId,
        enabled: from.enabled,
        reason: from.reason,
      };
      from.textureId = to.textureId;
      from.enabled = to.enabled;
      from.reason = to.reason;
      to.textureId = fromTarget.textureId;
      to.enabled = fromTarget.enabled;
      to.reason = fromTarget.reason;
      return next;
    });
  };

  const handleAutoPair = () =>
    setPairs(autoPairTextures(enrichedSources, enrichedCandidates));
  const clearPairs = () =>
    setPairs(
      sources.map((source) => ({
        nodeId: source.nodeId,
        textureId: null,
        enabled: false,
      })),
    );

  const handleApply = () => {
    let result = { replacedNodeIds: [], skippedNodeIds: [] };
    updateProject((draft, versionControl) => {
      result = applyTextureReplacements(draft, pairs, dimensionsWithSources, {
        preserveDeformation,
        autoFit,
      });
      if (result.replacedNodeIds.length > 0) versionControl.textureVersion += 1;
    });
    if (result.replacedNodeIds.length === 0) {
      toast({
        title: "Nothing replaced",
        description: "Choose and enable at least one valid pair.",
      });
      return;
    }
    toast({
      title: `${result.replacedNodeIds.length} texture${result.replacedNodeIds.length === 1 ? "" : "s"} replaced`,
      description:
        result.skippedNodeIds.length > 0
          ? `${result.skippedNodeIds.length} invalid pair(s) skipped.`
          : "Project rig kept stable. You can undo this batch.",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(880px,92vh)] w-[min(1500px,96vw)] max-w-none !flex flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-primary" /> Replace
                textures
              </DialogTitle>
              <DialogDescription className="mt-1">
                Pair canvas layers with unused Library assets. Nothing changes
                until Apply.
              </DialogDescription>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleAutoPair}
                disabled={
                  loadingDimensions ||
                  sources.length === 0 ||
                  candidates.length === 0
                }
              >
                <Sparkles className="mr-1.5 h-4 w-4" /> Auto-match
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={clearPairs}
                disabled={pairs.every((pair) => !pair.textureId)}
              >
                Clear all
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,3fr)_minmax(260px,0.9fr)] overflow-hidden bg-muted/10">
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r">
            <div className="grid h-12 shrink-0 grid-cols-[minmax(240px,1fr)_64px_minmax(260px,1fr)] border-b">
              <div className="border-r px-4 py-2">
                <p className="text-xs font-semibold">In use on canvas</p>
                <p className="text-[10px] text-muted-foreground">
                  {sources.length} layer{sources.length === 1 ? "" : "s"} •
                  fixed order
                </p>
              </div>
              <div className="flex items-center justify-center border-r bg-muted/20 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                Replace
              </div>
              <div className="px-4 py-2">
                <p className="text-xs font-semibold">Replacement slots</p>
                <p className="text-[10px] text-muted-foreground">
                  Drop assets here • reorder to pair
                </p>
              </div>
            </div>
            <ScrollArea className="h-0 min-h-0 flex-1" type="always">
              <div className="p-2 pr-3">
                {pairs.map((pair, index) => {
                  const source = sources[index];
                  const currentTexture = source
                    ? textureMap.get(source.textureId)
                    : null;
                  const texture = pair.textureId
                    ? textureMap.get(pair.textureId)
                    : null;
                  const candidate = enrichedCandidates.find(
                    (item) => item.textureId === pair.textureId,
                  );
                  const failed =
                    pair.textureId && failedTextureIds.has(pair.textureId);
                  const sourceDimensions = dimensionsWithSources.get(
                    source?.textureId,
                  );
                  const targetDimensions = pair.textureId
                    ? dimensionsWithSources.get(pair.textureId)
                    : null;
                  const aspectMismatch =
                    sourceDimensions && targetDimensions
                      ? Math.abs(
                          sourceDimensions.width /
                            sourceDimensions.height /
                            (targetDimensions.width / targetDimensions.height) -
                            1,
                        ) > 0.05
                      : false;
                  return (
                    <div
                      key={pair.nodeId}
                      className="mb-1 grid h-[66px] grid-cols-[minmax(240px,1fr)_64px_minmax(260px,1fr)] last:mb-0"
                    >
                      <div className="flex min-w-0 items-center gap-3 rounded border bg-background px-3">
                        <TextureThumb
                          texture={currentTexture}
                          name={source?.name ?? pair.nodeId}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-xs font-medium"
                            title={source?.name}
                          >
                            {source?.name ?? pair.nodeId}
                          </p>
                          <p
                            className="truncate text-[10px] text-muted-foreground"
                            title={currentTexture?.fileName}
                          >
                            {currentTexture?.fileName ?? source?.textureId}
                          </p>
                          <p className="text-[9px] text-muted-foreground">
                            <SizeLabel dimensions={sourceDimensions} />
                            {project.nodes.find(
                              (node) => node.id === pair.nodeId,
                            )?.mesh
                              ? " • mesh + weights"
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-center bg-muted/20">
                        <button
                          type="button"
                          aria-label={`${pair.enabled ? "Disable" : "Enable"} replacement for ${source?.name ?? pair.nodeId}`}
                          aria-pressed={pair.enabled}
                          disabled={
                            !pair.textureId ||
                            failedTextureIds.has(pair.textureId)
                          }
                          onClick={() =>
                            setPairs((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, enabled: !item.enabled }
                                  : item,
                              ),
                            )
                          }
                          className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${pair.enabled ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                        >
                          {pair.enabled ? (
                            <Link2 className="h-4 w-4" />
                          ) : (
                            <Unlink className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <div
                        draggable={!!pair.textureId}
                        onDragStart={(event) =>
                          writeDrag(event, { kind: "slot", index })
                        }
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const drag = readDrag(event);
                          if (drag?.kind === "asset")
                            assignTexture(index, drag.textureId);
                          else if (drag?.kind === "slot")
                            swapTargets(drag.index, index);
                        }}
                        className={`flex min-w-0 items-center gap-2 rounded border px-2 transition-colors ${pair.enabled ? "border-primary/35 bg-primary/5" : "border-dashed bg-background/50 text-muted-foreground"} ${failed ? "border-destructive/60 bg-destructive/5" : ""}`}
                      >
                        <TextureThumb
                          texture={texture}
                          name={candidate?.name ?? "Empty replacement"}
                          muted={!pair.enabled}
                        />
                        <div
                          className={`min-w-0 flex-1 ${pair.enabled ? "" : "opacity-45"}`}
                        >
                          {candidate ? (
                            <>
                              <p
                                className="truncate text-xs font-medium"
                                title={candidate.name}
                              >
                                {candidate.name}
                              </p>
                              <div className="flex flex-wrap items-center gap-1 text-[9px] text-muted-foreground">
                                <SizeLabel dimensions={targetDimensions} />
                                <PairReason reason={pair.reason} />
                                {aspectMismatch && (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-500">
                                    <AlertTriangle className="h-2.5 w-2.5" />{" "}
                                    aspect differs
                                  </span>
                                )}
                              </div>
                              {failed && (
                                <p className="text-[9px] text-destructive">
                                  Image failed to load — blocked
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Drop Library asset
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center">
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-25"
                            disabled={index === 0}
                            onClick={() => swapTargets(index, index - 1)}
                            aria-label="Move replacement up"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-25"
                            disabled={index === pairs.length - 1}
                            onClick={() => swapTargets(index, index + 1)}
                            aria-label="Move replacement down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-25"
                            disabled={!pair.textureId}
                            onClick={() =>
                              setPairs((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        textureId: null,
                                        enabled: false,
                                        reason: undefined,
                                      }
                                    : item,
                                ),
                              )
                            }
                            aria-label="Clear replacement"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {sources.length === 0 && (
                  <p className="p-6 text-center text-xs text-muted-foreground">
                    No image layers on canvas.
                  </p>
                )}
              </div>
            </ScrollArea>
          </section>

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-muted/15">
            <div className="h-12 shrink-0 border-b px-3 py-2">
              <label className="flex h-7 items-center gap-2 rounded border bg-background px-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={`Available Library assets (${availableCandidates.length})`}
                  className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
                />
              </label>
            </div>
            <ScrollArea className="h-0 min-h-0 flex-1" type="always">
              <div className="space-y-1 p-2 pr-3">
                {availableCandidates.map((candidate) => {
                  const texture = textureMap.get(candidate.textureId);
                  const failed = failedTextureIds.has(candidate.textureId);
                  return (
                    <button
                      type="button"
                      key={candidate.textureId}
                      draggable={!failed}
                      disabled={
                        failed || !pairs.some((pair) => !pair.textureId)
                      }
                      onDragStart={(event) =>
                        writeDrag(event, {
                          kind: "asset",
                          textureId: candidate.textureId,
                        })
                      }
                      onClick={() => assignFirstEmpty(candidate.textureId)}
                      className="flex w-full items-center gap-2 rounded border border-transparent bg-background/70 p-2 text-left hover:border-primary/30 hover:bg-background disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <TextureThumb texture={texture} name={candidate.name} />
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-xs font-medium"
                          title={candidate.name}
                        >
                          {candidate.name}
                        </span>
                        <span
                          className={`block text-[9px] ${failed ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {failed ? (
                            "Image failed to load"
                          ) : (
                            <SizeLabel
                              dimensions={dimensionsWithSources.get(
                                candidate.textureId,
                              )}
                            />
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {availableCandidates.length === 0 && (
                  <p className="p-6 text-center text-xs text-muted-foreground">
                    {candidates.length === 0
                      ? "No unused Library assets."
                      : "No matching available assets."}
                  </p>
                )}
              </div>
            </ScrollArea>
          </section>
        </div>

        <div className="relative z-10 grid min-h-[76px] shrink-0 grid-cols-[1fr_1fr_auto] items-center gap-6 border-t bg-background px-6 py-3 shadow-[0_-8px_20px_rgba(0,0,0,0.08)]">
          <div className="flex min-w-0 items-center gap-3">
            <Switch
              id="preserve-replacement-deformation"
              checked={preserveDeformation}
              onCheckedChange={setPreserveDeformation}
              aria-label="Preserve mesh, weights, and deformation"
            />
            <label
              htmlFor="preserve-replacement-deformation"
              className="min-w-0 cursor-pointer"
            >
              <span className="block text-xs font-medium">
                Preserve mesh, weights & animation
              </span>
              <span
                className={`block text-[10px] ${!preserveDeformation && meshPairCount > 0 ? "text-amber-500" : "text-muted-foreground"}`}
              >
                {!preserveDeformation && meshPairCount > 0
                  ? `Off: clears mesh, weights, shape keys and mesh tracks for ${meshPairCount} layer(s). Undo available.`
                  : "Recommended for same-shape artwork. UVs map new texture onto current rig."}
              </span>
            </label>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <Switch
              id="auto-fit-replacement-texture"
              checked={autoFit}
              onCheckedChange={setAutoFit}
              aria-label="Auto-fit to current bounds"
            />
            <label
              htmlFor="auto-fit-replacement-texture"
              className="min-w-0 cursor-pointer"
            >
              <span className="block text-xs font-medium">
                Auto-fit to current bounds
              </span>
              <span className="block text-[10px] text-muted-foreground">
                Keeps size, center, pivots and bones. Preserved meshes always
                define their frame.
              </span>
            </label>
          </div>
          <DialogFooter className="items-center gap-2 sm:space-x-0">
            <span className="mr-2 whitespace-nowrap text-[10px] text-muted-foreground">
              {activePairCount} ready
              {meshPairCount > 0 ? ` • ${meshPairCount} mesh` : ""}
              {aspectMismatchCount > 0
                ? ` • ${aspectMismatchCount} aspect warning`
                : ""}
              {loadingDimensions ? " • reading sizes…" : ""}
            </span>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={activePairCount === 0 || loadingDimensions}
            >
              <Check className="mr-1.5 h-4 w-4" /> Apply replacements
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
