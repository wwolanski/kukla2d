import { Check, GripVertical, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type {
  SemanticCatalog,
  SemanticDefinition,
} from "@kukla2d/modular-sprite-schema";

import { SemanticRolePicker } from "@/features/modular-sprite-schema";

import { BorderBeam } from "@/components/ui/border-beam";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

import { PartThumbnail } from "../preview/PartThumbnail.js";

import type {
  DetectedRegion,
  ModularSpriteDraftPart,
  ProcessedModularSprite,
} from "../../domain/contracts.types.js";
import type { RegionGrouping } from "../../domain/partGrouping.types.js";

const UiButton = Button as React.ComponentType<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }
>;
const UiInput = Input as React.ComponentType<
  React.InputHTMLAttributes<HTMLInputElement>
>;
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

function partColor(
  parts: readonly ModularSpriteDraftPart[],
  partKey: string,
): string {
  const index = parts.findIndex((part) => part.partKey === partKey);
  return PART_COLORS[(index < 0 ? 0 : index) % PART_COLORS.length]!;
}

function regionTargetKey(partKey: string): string {
  return "part:" + partKey;
}

function normalizedPartName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function suggestedNameForRole(
  role: string,
  semanticRoleId: string | undefined,
  partIndex: number,
  grouping: RegionGrouping,
  semantics: SemanticCatalog,
  reservedNames: readonly string[] = [],
): string {
  const definition = semantics
    .list("part-role")
    .find((item) => item.id === semanticRoleId || item.key === role);
  const fallback = role
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const base = definition?.label.trim() || fallback || `Part ${partIndex + 1}`;
  const taken = new Set(
    grouping.parts
      .filter((_, index) => index !== partIndex)
      .map((part) => normalizedPartName(part.name))
      .concat(reservedNames.map(normalizedPartName)),
  );
  if (!taken.has(normalizedPartName(base))) return base;
  let suffix = 2;
  while (taken.has(normalizedPartName(`${base} ${suffix}`))) suffix += 1;
  return `${base} ${suffix}`;
}

function RegionRow({
  region,
  resultRef,
  resultVersion,
  isSelected,
  excluded,
  onSelect,
  onDragStart,
  onDragEnd,
  onExclude,
}: {
  region: DetectedRegion;
  resultRef: React.RefObject<ProcessedModularSprite | null>;
  resultVersion: number;
  isSelected: boolean;
  excluded: boolean;
  onSelect: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onExclude?: () => void;
}): React.ReactElement {
  const rowClassName = [
    "flex min-h-10 w-full items-center gap-1.5 rounded border px-1.5 py-1 pr-8 text-left text-xs",
    isSelected
      ? "border-primary bg-primary/10"
      : excluded
        ? "border-transparent text-muted-foreground hover:border-slate-500 hover:bg-slate-500/30"
        : "border-transparent hover:border-border hover:bg-muted/50",
  ].join(" ");
  const thumbnailClassName = [
    "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border bg-black/30",
    excluded ? "border-slate-500/60 bg-slate-700/40 opacity-70 grayscale" : "",
  ].join(" ");

  return (
    <div className="group relative">
      <button
        type="button"
        draggable
        className={rowClassName}
        aria-pressed={isSelected}
        onClick={onSelect}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <GripVertical
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
          aria-hidden
        />
        <span className={thumbnailClassName}>
          <PartThumbnail
            resultRef={resultRef}
            resultVersion={resultVersion}
            regionIds={[region.id]}
            maxSize={30}
          />
        </span>
        <span className="truncate">
          Region {region.id}
          {excluded ? " · excluded" : ""}
        </span>
      </button>
      {onExclude && (
        <button
          type="button"
          className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={"Exclude region " + region.id}
          title="Exclude from import"
          onClick={(event) => {
            event.stopPropagation();
            onExclude();
          }}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function RegionGroupingStep({
  result,
  grouping,
  resultRef,
  resultVersion,
  selectedRegionIds,
  onMoveRegionsToPart,
  onExcludeRegions,
  onCreatePart,
  onSelectRegion,
  onUpdatePart,
  semanticCatalog,
  onSaveSemantic,
  onPendingNameSuggestionsChange,
}: {
  result: ProcessedModularSprite;
  grouping: RegionGrouping;
  resultRef: React.RefObject<ProcessedModularSprite | null>;
  resultVersion: number;
  selectedRegionIds: ReadonlySet<number>;
  onMoveRegionsToPart: (
    regionIds: readonly number[],
    targetPartKey: string,
  ) => void;
  onExcludeRegions: (regionIds: readonly number[]) => void;
  onCreatePart: () => void;
  onSelectRegion: (regionId: number, additive: boolean) => void;
  onUpdatePart: (
    index: number,
    change: Partial<ModularSpriteDraftPart>,
  ) => void;
  semanticCatalog: SemanticCatalog;
  onSaveSemantic: (definition: SemanticDefinition) => Promise<void>;
  onPendingNameSuggestionsChange: (pending: boolean) => void;
}): React.ReactElement {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [pendingNames, setPendingNames] = useState<
    Record<string, { suggestedName: string }>
  >({});
  const draggedRegionIds = useRef<number[]>([]);

  useEffect(() => {
    onPendingNameSuggestionsChange(Object.keys(pendingNames).length > 0);
  }, [onPendingNameSuggestionsChange, pendingNames]);

  useEffect(
    () => () => onPendingNameSuggestionsChange(false),
    [onPendingNameSuggestionsChange],
  );

  useEffect(() => {
    const partKeys = new Set(grouping.parts.map((part) => part.partKey));
    setPendingNames((previous) => {
      const next = Object.fromEntries(
        Object.entries(previous).filter(([partKey]) => partKeys.has(partKey)),
      );
      return Object.keys(next).length === Object.keys(previous).length
        ? previous
        : next;
    });
  }, [grouping.parts]);
  const assigned = new Set(grouping.parts.flatMap((part) => part.regionIds));
  const excluded = result.regions.filter(
    (region) =>
      grouping.excludedRegionIds.includes(region.id) ||
      !assigned.has(region.id),
  );

  const handleRegionDragStart = (
    event: React.DragEvent<HTMLButtonElement>,
    regionId: number,
  ): void => {
    const regionIds = selectedRegionIds.has(regionId)
      ? [...selectedRegionIds]
      : [regionId];
    draggedRegionIds.current = regionIds;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", regionIds.join(","));
  };

  const handleRegionDragEnd = (): void => {
    draggedRegionIds.current = [];
    setDropTarget(null);
  };

  const handleDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    target: string,
  ): void => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(target);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>): void => {
    const relatedTarget = event.relatedTarget;
    if (
      !relatedTarget ||
      !(relatedTarget instanceof Node) ||
      !event.currentTarget.contains(relatedTarget)
    )
      setDropTarget(null);
  };

  const handleDrop = (
    event: React.DragEvent<HTMLDivElement>,
    targetPartKey: string | null,
  ): void => {
    event.preventDefault();
    const ids =
      draggedRegionIds.current.length > 0
        ? draggedRegionIds.current
        : event.dataTransfer
            .getData("text/plain")
            .split(",")
            .map(Number)
            .filter((id) => Number.isFinite(id));
    if (ids.length > 0) {
      if (targetPartKey) onMoveRegionsToPart(ids, targetPartKey);
      else onExcludeRegions(ids);
    }
    draggedRegionIds.current = [];
    setDropTarget(null);
  };

  return (
    <ScrollArea className="h-full min-h-0 min-w-0 rounded-lg border">
      <aside className="space-y-4 p-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Drag regions between parts to assign them. Click a region to select
            it; Shift-click selects several and carries the group while
            dragging.
          </p>
          <p className="text-[11px] text-muted-foreground/80">
            Choose each part&apos;s role with the icon button. A matching name
            is suggested for you to accept or dismiss. Use the X on hover to
            exclude a region from import.
          </p>
        </div>

        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium">Parts and regions</div>
            <UiButton
              className="ml-auto"
              size="sm"
              variant="outline"
              onClick={onCreatePart}
              title="Create an empty part"
            >
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
              Add new part
            </UiButton>
          </div>

          {grouping.parts.map((part, partIndex) => {
            const target = regionTargetKey(part.partKey);
            const isDropTarget = dropTarget === target;
            const color = partColor(grouping.parts, part.partKey);
            const pendingName = pendingNames[part.partKey];
            return (
              <div
                key={partIndex}
                className={[
                  "overflow-hidden rounded-md border bg-muted/10 transition-colors",
                  isDropTarget
                    ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                    : "",
                ].join(" ")}
                onDragOver={(event) => handleDragOver(event, target)}
                onDragLeave={handleDragLeave}
                onDrop={(event) => handleDrop(event, part.partKey)}
              >
                <div className="flex items-center gap-2 border-b px-2 py-1.5 text-xs font-semibold">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="shrink-0 text-muted-foreground">Part</span>
                  <div
                    className={[
                      "relative flex min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-md",
                      pendingName ? "border border-primary/50" : "",
                    ].join(" ")}
                  >
                    <UiInput
                      className={[
                        "h-7 min-w-0 flex-1 px-2 text-xs font-medium",
                        pendingName
                          ? "border-0 bg-muted/50 pr-16 text-muted-foreground shadow-none focus-visible:ring-0"
                          : "",
                      ].join(" ")}
                      aria-label={"Name of part " + (partIndex + 1)}
                      value={pendingName?.suggestedName ?? part.name}
                      readOnly={Boolean(pendingName)}
                      onChange={(event) =>
                        onUpdatePart(partIndex, { name: event.target.value })
                      }
                    />
                    {pendingName && (
                      <div className="absolute right-0.5 z-10 flex items-center gap-0.5">
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300"
                          aria-label={`Accept suggested name ${pendingName.suggestedName}`}
                          title="Accept suggested name"
                          onClick={() => {
                            onUpdatePart(partIndex, {
                              name: pendingName.suggestedName,
                            });
                            setPendingNames((previous) => {
                              const next = { ...previous };
                              delete next[part.partKey];
                              return next;
                            });
                          }}
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                          aria-label={`Dismiss suggested name ${pendingName.suggestedName}`}
                          title="Keep current name"
                          onClick={() =>
                            setPendingNames((previous) => {
                              const next = { ...previous };
                              delete next[part.partKey];
                              return next;
                            })
                          }
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    )}
                    {pendingName && <BorderBeam duration={3.5} />}
                  </div>
                  <div className="ml-auto shrink-0 font-normal">
                    <SemanticRolePicker
                      compact
                      role={part.role}
                      {...(part.semanticRoleId
                        ? { semanticRoleId: part.semanticRoleId }
                        : {})}
                      semantics={semanticCatalog}
                      onSaveSemantic={onSaveSemantic}
                      onChange={(value) => {
                        onUpdatePart(partIndex, value);
                        setPendingNames((previous) => {
                          const suggestedName = suggestedNameForRole(
                            value.role,
                            value.semanticRoleId,
                            partIndex,
                            grouping,
                            semanticCatalog,
                            Object.entries(previous)
                              .filter(([partKey]) => partKey !== part.partKey)
                              .map(
                                ([, suggestion]) => suggestion.suggestedName,
                              ),
                          );
                          if (
                            normalizedPartName(suggestedName) ===
                            normalizedPartName(part.name)
                          ) {
                            const next = { ...previous };
                            delete next[part.partKey];
                            return next;
                          }
                          return {
                            ...previous,
                            [part.partKey]: { suggestedName },
                          };
                        });
                      }}
                    />
                  </div>
                </div>
                {part.regionIds.length > 0 ? (
                  <ul className="ml-4 space-y-1 py-1 pl-2 pr-1">
                    {part.regionIds.map((regionId) => {
                      const region = result.regions.find(
                        (item) => item.id === regionId,
                      );
                      if (!region) return null;
                      return (
                        <li key={region.id}>
                          <RegionRow
                            region={region}
                            resultRef={resultRef}
                            resultVersion={resultVersion}
                            isSelected={selectedRegionIds.has(region.id)}
                            excluded={false}
                            onSelect={(event) =>
                              onSelectRegion(region.id, event.shiftKey)
                            }
                            onDragStart={(event) =>
                              handleRegionDragStart(event, region.id)
                            }
                            onDragEnd={handleRegionDragEnd}
                            onExclude={() => onExcludeRegions([region.id])}
                          />
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="px-3 py-3 text-[11px] italic text-muted-foreground">
                    Drop regions here
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          className={[
            "overflow-hidden rounded-md border border-slate-500/70 bg-slate-500/20 text-muted-foreground transition-colors",
            dropTarget === "excluded"
              ? "border-primary bg-primary/10 ring-1 ring-primary/40"
              : "",
          ].join(" ")}
          onDragOver={(event) => handleDragOver(event, "excluded")}
          onDragLeave={handleDragLeave}
          onDrop={(event) => handleDrop(event, null)}
        >
          <div className="flex items-center gap-2 border-b border-slate-500/50 px-2 py-1.5 text-xs font-semibold">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-500" />
            <span>Excluded</span>
            <span className="ml-auto font-normal">{excluded.length}</span>
          </div>
          {excluded.length > 0 ? (
            <ul className="ml-4 space-y-1 py-1 pl-2 pr-1">
              {excluded.map((region) => (
                <li key={region.id}>
                  <RegionRow
                    region={region}
                    resultRef={resultRef}
                    resultVersion={resultVersion}
                    isSelected={selectedRegionIds.has(region.id)}
                    excluded
                    onSelect={(event) =>
                      onSelectRegion(region.id, event.shiftKey)
                    }
                    onDragStart={(event) =>
                      handleRegionDragStart(event, region.id)
                    }
                    onDragEnd={handleRegionDragEnd}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-3 text-[11px] italic text-muted-foreground">
              Drop regions here to exclude them from import
            </div>
          )}
        </div>
      </aside>
    </ScrollArea>
  );
}
