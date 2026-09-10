import { GripVertical, Plus, X } from "lucide-react";
import { useRef, useState } from "react";

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
}): React.ReactElement {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const draggedRegionIds = useRef<number[]>([]);
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
            Use the X on hover to exclude a region from import.
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
            return (
              <div
                key={part.partKey}
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
                  <UiInput
                    className="h-7 min-w-0 flex-1 px-2 text-xs font-medium"
                    aria-label={"Name of part " + (partIndex + 1)}
                    value={part.name}
                    onChange={(event) =>
                      onUpdatePart(partIndex, { name: event.target.value })
                    }
                  />
                  <span className="ml-auto shrink-0 font-normal text-muted-foreground">
                    {part.regionIds.length}{" "}
                    {part.regionIds.length === 1 ? "region" : "regions"}
                  </span>
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
