import { Eye, EyeOff } from "lucide-react";
import { useRef } from "react";

import { truncateDisplayName } from "@/domain/nameConstraints.js";

import { useInlineRename } from "@/features/layers/application/useInlineRename.js";
import { InlineRenameInput } from "@/features/layers/components/shared/InlineRenameInput.jsx";
import {
  AssetAvatar,
  PartIcon,
} from "@/features/layers/components/shared/LayerPanelPrimitives.jsx";
import { computeDropPosition } from "@/features/layers/domain/dragSession.js";

export function DepthRow({
  node,
  previewTexture,
  isSelected,
  dragSession,
  onSelect,
  onHover,
  onClearHover,
  onToggleVisible,
  onDragStart,
  onDragOver,
  onDrop,
  onRename,
}) {
  const isVisible = node.visible !== false;
  const rowRef = useRef(null);
  const isDragOver =
    dragSession?.targetId === node.id && dragSession?.sourceId !== node.id;
  const dropPosition = isDragOver ? dragSession.dropPosition : null;

  const { isEditing, draft, setDraft, startEdit, handleKeyDown, handleBlur } =
    useInlineRename({
      currentName: node.name || node.id,
      onRename: (val) => onRename?.(node.id, val),
    });

  const handleDragOver = (e) => {
    e.preventDefault();
    const rect = rowRef.current?.getBoundingClientRect();
    const pos = computeDropPosition(
      { clientY: e.clientY, top: rect?.top, height: rect?.height },
      "after",
    );
    onDragOver(node.id, pos);
  };

  return (
    <div
      ref={rowRef}
      draggable
      className={`
        layer-panel-row relative flex min-w-0 w-full items-center gap-1 overflow-hidden rounded px-2 py-1.5 text-sm cursor-pointer transition-colors select-none
        ${
          isSelected
            ? "bg-primary/20 text-primary border border-primary/40"
            : isDragOver
              ? "bg-accent border border-accent-foreground/30"
              : "hover:bg-muted text-foreground border border-transparent"
        }
        ${!isVisible ? "opacity-50" : ""}
      `}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={onClearHover}
      onClick={() => onSelect(node.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
      onDragStart={(e) => onDragStart(e, node.id)}
      onDragOver={handleDragOver}
      onDragLeave={() => onDragOver(null, null)}
      onDrop={(e) => {
        e.preventDefault();
        const rect = rowRef.current?.getBoundingClientRect();
        const pos = computeDropPosition(
          { clientY: e.clientY, top: rect?.top, height: rect?.height },
          "before",
        );
        onDrop(node.id, pos);
      }}
    >
      <AssetAvatar
        src={previewTexture?.source}
        label={node.name || node.id}
        fallback={<PartIcon />}
      />

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
          title={node.name || node.id}
        >
          {truncateDisplayName(node.name || node.id)}
        </span>
      )}

      {isDragOver && dropPosition === "before" && (
        <span className="absolute left-1 right-1 top-0 h-0.5 rounded-full bg-primary" />
      )}
      {isDragOver && dropPosition === "after" && (
        <span className="absolute left-1 right-1 bottom-0 h-0.5 rounded-full bg-primary" />
      )}

      <button
        className={`shrink-0 w-5 h-5 flex items-center justify-center rounded-sm hover:bg-foreground/10 transition-colors ${isVisible ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/40"}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisible(node.id);
        }}
        title={isVisible ? "Hide layer" : "Show layer"}
      >
        {isVisible ? <Eye size={20} /> : <EyeOff size={20} />}
      </button>
    </div>
  );
}
