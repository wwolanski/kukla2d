import { Boxes, Check, FileImage, Lock, Pencil, Trash2 } from "lucide-react";
import { useRef } from "react";

import { truncateDisplayName } from "@/domain/nameConstraints.js";

import { useInlineRename } from "@/features/layers/application/useInlineRename.js";
import { formatFileSize } from "@/features/layers/components/shared/formatFileSize.js";
import { InlineRenameInput } from "@/features/layers/components/shared/InlineRenameInput.jsx";
import { AssetAvatar } from "@/features/layers/components/shared/LayerPanelPrimitives.jsx";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.jsx";

export function LibraryAssetRow({
  asset,
  isSelected,
  dragSession,
  depth,
  onSelect,
  onRename,
  onRemove,
  onRemoveFromPackage,
  onRegenerateModularSprite,
  onDragStart,
  onDragOver,
  onDrop,
}) {
  const rowRef = useRef(null);
  const isDragOver =
    dragSession?.targetId === asset.id && dragSession?.sourceId !== asset.id;

  const { isEditing, draft, setDraft, startEdit, handleKeyDown, handleBlur } =
    useInlineRename({
      currentName: asset.name,
      onRename: (val) => onRename?.(asset.id, val),
    });

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDragOver?.("asset", asset.id, "inside");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDrop?.("asset", asset.id);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={rowRef}
          draggable={asset.modularKind !== "source"}
          className={`layer-panel-row flex min-w-0 w-full items-center gap-2 overflow-hidden rounded px-2 py-1.5 text-xs cursor-pointer transition-colors select-none
        ${
          isSelected
            ? "bg-primary/20 text-primary border border-primary/40"
            : isDragOver
              ? "bg-accent border border-accent-foreground/30"
              : "hover:bg-muted text-foreground border border-transparent"
        }
      `}
          style={{ paddingLeft: `${(depth ?? 0) * 16 + 8}px` }}
          onClick={() => onSelect?.(asset.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (asset.modularKind === "source")
              onRegenerateModularSprite?.(asset.modularSpriteId);
            else if (asset.modularKind !== "part") startEdit();
          }}
          onDragStart={(e) => {
            if (asset.modularKind === "source") {
              e.preventDefault();
              return;
            }
            onDragStart?.(e, asset.id);
          }}
          onDragOver={handleDragOver}
          onDragLeave={() => onDragOver?.(null, null)}
          onDrop={handleDrop}
        >
          <AssetAvatar
            src={asset.texture?.source}
            label={asset.name}
            fallback={<FileImage className="h-3.5 w-3.5" />}
          />

          <div className="min-w-0 flex-1 flex flex-col">
            {isEditing ? (
              <InlineRenameInput
                value={draft}
                onChange={setDraft}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
              />
            ) : (
              <span className="block min-w-0 truncate font-mono text-xs" title={asset.name}>
                {truncateDisplayName(asset.name)}
              </span>
            )}
            {asset.sourceFileName && asset.sourceFileName !== asset.name && (
              <span
                className="layer-panel-source-name block min-w-0 truncate text-[9px] text-muted-foreground/50"
                title={asset.sourceFileName}
              >
                {truncateDisplayName(asset.sourceFileName)}
              </span>
            )}
          </div>

          <span className="layer-panel-row-meta flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
            {asset.isInUse && (
              <Check
                className="h-3.5 w-3.5 text-emerald-500"
                aria-label="Used on canvas"
              />
            )}
            {asset.modularKind === "source" && (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary/15 px-1 py-0.5 text-[8px] font-semibold uppercase text-primary"
                title="Modular source"
                aria-label="Modular source"
              >
                <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                <span className="layer-panel-meta-label">Modular Source</span>
              </span>
            )}
            {asset.modularKind === "part" && (
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10 text-primary/80"
                title="Package part"
                aria-label="Package part"
              >
                <Boxes className="h-2.5 w-2.5" aria-hidden="true" />
              </span>
            )}
            <span className="layer-panel-file-size whitespace-nowrap">
              {formatFileSize(asset.size)}
            </span>
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {asset.modularKind === "part" ? (
          <>
            <ContextMenuItem
              onSelect={() =>
                requestAnimationFrame(() => onRemoveFromPackage?.(asset.id))
              }
            >
              <Boxes className="mr-2 h-4 w-4 opacity-70" />
              Remove from package
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onRemove?.(asset.id)}
            >
              <Trash2 className="mr-2 h-4 w-4 opacity-70" />
              Remove from library
            </ContextMenuItem>
          </>
        ) : (
          <>
            {asset.modularKind === "source" && onRegenerateModularSprite && (
              <ContextMenuItem
                onSelect={() =>
                  requestAnimationFrame(() =>
                    onRegenerateModularSprite(asset.modularSpriteId),
                  )
                }
              >
                <Boxes className="mr-2 h-4 w-4 opacity-70" />
                Regenerate package…
              </ContextMenuItem>
            )}
            <ContextMenuItem onSelect={() => requestAnimationFrame(startEdit)}>
              <Pencil className="mr-2 h-4 w-4 opacity-70" />
              {asset.modularKind === "source" ? "Rename set" : "Rename"}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onRemove?.(asset.id)}
            >
              <Trash2 className="mr-2 h-4 w-4 opacity-70" />
              {asset.modularKind === "source"
                ? "Delete modular sprite"
                : "Remove from library"}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
