import {
  Boxes,
  FilePenLine,
  FolderX,
  Link2,
  Lock,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { useRef } from "react";

import { truncateDisplayName } from "@/domain/nameConstraints.js";

import { useInlineRename } from "@/features/layers/application/useInlineRename.js";
import { InlineRenameInput } from "@/features/layers/components/shared/InlineRenameInput.jsx";
import { ChevronIcon } from "@/features/layers/components/shared/LayerPanelPrimitives.jsx";
import { computeDropPosition } from "@/features/layers/domain/dragSession.js";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.jsx";

export function LibraryFolderRow({
  folder,
  isExpanded,
  dragSession,
  depth,
  onToggleExpand,
  onRename,
  onRemove,
  onRegenerateModularSprite,
  onDragStart,
  onDragOver,
  onDrop,
}) {
  const rowRef = useRef(null);
  const isDragOver =
    !folder.isModularSpritePackage &&
    dragSession?.targetId === folder.id &&
    dragSession?.sourceId !== folder.id;
  const dropPosition = isDragOver ? dragSession.dropPosition : null;

  const { isEditing, draft, setDraft, startEdit, handleKeyDown, handleBlur } =
    useInlineRename({
      currentName: folder.name,
      onRename: (val) => onRename?.(folder.id, val),
    });

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = rowRef.current?.getBoundingClientRect();
    const pos = computeDropPosition(
      { clientY: e.clientY, top: rect?.top, height: rect?.height },
      "inside",
    );
    onDragOver?.("folder", folder.id, pos);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDrop?.("folder", folder.id);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={rowRef}
          draggable={!folder.isModularSpritePackage}
          className={`layer-panel-row relative flex min-w-0 w-full items-center gap-1 overflow-hidden rounded px-2 py-1.5 text-xs cursor-pointer transition-colors select-none
        ${
          isDragOver
            ? "bg-accent border border-accent-foreground/30"
            : "hover:bg-muted text-foreground border border-transparent"
        }
      `}
          style={{ paddingLeft: `${(depth ?? 0) * 16 + 8}px` }}
          onClick={() => onToggleExpand?.(folder.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            startEdit();
          }}
          onDragStart={(e) => {
            if (!folder.isModularSpritePackage) onDragStart?.(e, folder.id);
          }}
          onDragOver={handleDragOver}
          onDragLeave={() => onDragOver?.(null, null)}
          onDrop={handleDrop}
        >
          <ChevronIcon open={isExpanded} />

          {folder.isModularSpritePackage ? (
            <span
              className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center text-primary"
              title="Locked modular sprite package"
              aria-label="Locked modular sprite package"
            >
              <Boxes className="h-3.5 w-3.5" />
              <Lock className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-sm bg-background" />
            </span>
          ) : (
            <span className="shrink-0 text-muted-foreground">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              >
                <path d="M2 4.5V11h10V5.5H7.5L6 4H2z" />
              </svg>
            </span>
          )}

          {isEditing ? (
            <InlineRenameInput
              value={draft}
              onChange={setDraft}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
            />
          ) : (
            <span
              className="min-w-0 flex-1 truncate font-mono text-xs"
              title={folder.name}
            >
              {truncateDisplayName(folder.name)}
            </span>
          )}

          {folder.sourceFileName && (
            <span
              className="layer-panel-source-name max-w-[80px] shrink-0 truncate text-[9px] text-muted-foreground/50"
              title={folder.sourceFileName}
            >
              {truncateDisplayName(folder.sourceFileName)}
            </span>
          )}

          {folder.isModularSpritePackage && (
            <span
              className="layer-panel-optional-meta inline-flex shrink-0 items-center gap-0.5 rounded bg-primary/15 px-1 py-0.5 text-[8px] font-semibold uppercase text-primary"
              title="Modular package"
              aria-label="Modular package"
            >
              <Boxes className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
              <span className="layer-panel-meta-label">Modular package</span>
            </span>
          )}

          {folder.schemaLink && (
            <span
              className={`layer-panel-optional-meta inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-semibold uppercase ${
                folder.schemaLink.status === "dirty"
                  ? "bg-amber-500/15 text-amber-400"
                  : folder.schemaLink.status === "managed"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-sky-500/15 text-sky-400"
              }`}
              title={`${folder.schemaLink.name} · ${folder.schemaLink.status === "dirty" ? "schema update pending" : folder.schemaLink.status === "managed" ? "managed local schema" : "schema reference"}`}
            >
              {folder.schemaLink.status === "dirty" ? (
                <FilePenLine className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
              ) : folder.schemaLink.status === "managed" ? (
                <RefreshCw className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
              ) : (
                <Link2 className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
              )}
              <span className="layer-panel-meta-label">
                {folder.schemaLink.status === "dirty"
                  ? "Schema changed"
                  : folder.schemaLink.status === "managed"
                    ? "Schema synced"
                    : "Schema linked"}
              </span>
            </span>
          )}

          {isDragOver && dropPosition === "inside" && (
            <span className="absolute inset-0 rounded border-2 border-primary/40 pointer-events-none" />
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {folder.isModularSpritePackage && folder.modularSpriteId && (
          <>
            {onRegenerateModularSprite && (
              <ContextMenuItem
                onSelect={() =>
                  requestAnimationFrame(() =>
                    onRegenerateModularSprite(folder.modularSpriteId),
                  )
                }
              >
                <Boxes className="mr-2 h-4 w-4 opacity-70" />
                Regenerate package…
              </ContextMenuItem>
            )}
          </>
        )}
        <ContextMenuItem onSelect={() => requestAnimationFrame(startEdit)}>
          <Pencil className="mr-2 h-4 w-4 opacity-70" />
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => onRemove?.(folder.id)}
        >
          <FolderX className="mr-2 h-4 w-4 opacity-70" />
          {folder.isModularSpritePackage
            ? "Delete whole package"
            : "Remove from library"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
