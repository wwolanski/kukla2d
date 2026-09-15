import { Boxes, FolderX, Lock, Pencil } from "lucide-react";
import { useRef } from "react";

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
} from "@/components/ui/context-menu";

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
    dragSession?.targetId === folder.id && dragSession?.sourceId !== folder.id;
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
          className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded cursor-pointer transition-colors select-none
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
              className="flex-1 truncate font-mono text-xs"
              title={folder.name}
            >
              {folder.name}
            </span>
          )}

          {folder.sourceFileName && (
            <span
              className="shrink-0 text-[9px] text-muted-foreground/50 truncate max-w-[80px]"
              title={folder.sourceFileName}
            >
              {folder.sourceFileName}
            </span>
          )}

          {folder.isModularSpritePackage && (
            <span className="shrink-0 rounded bg-primary/15 px-1 py-0.5 text-[8px] font-semibold uppercase text-primary">
              Modular package
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
                  onRegenerateModularSprite(folder.modularSpriteId)
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
