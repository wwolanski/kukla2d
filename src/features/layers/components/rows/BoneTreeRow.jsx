import {
  Bone as BoneIcon,
  Link2,
  Unlink2,
  Crosshair,
  Eye,
  EyeOff,
  FileImage,
  Network,
  Pencil,
  Trash2,
} from "lucide-react";
import { useRef } from "react";

import { useInlineRename } from "@/features/layers/application/useInlineRename.js";
import { InlineRenameInput } from "@/features/layers/components/shared/InlineRenameInput.jsx";
import {
  AssetAvatar,
  ChevronIcon,
  PartIcon,
} from "@/features/layers/components/shared/LayerPanelPrimitives.jsx";
import { isBoneLinkLocked } from "@/features/rigging";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

function RowContextMenu({
  children,
  isStructureBlocked,
  detachLabel,
  onDetach,
  onRename,
  onDelete,
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        {isStructureBlocked && (
          <>
            <ContextMenuLabel className="text-[10px] font-normal text-muted-foreground">
              Detach and delete require Staging mode
            </ContextMenuLabel>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onSelect={() => requestAnimationFrame(onRename)}>
          <Pencil className="mr-2 h-4 w-4 opacity-70" />
          Rename
        </ContextMenuItem>
        {detachLabel && (
          <ContextMenuItem disabled={isStructureBlocked} onSelect={onDetach}>
            <Unlink2 className="mr-2 h-4 w-4 opacity-70" />
            {detachLabel}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={isStructureBlocked}
          className="text-destructive focus:text-destructive"
          onSelect={onDelete}
        >
          <Trash2 className="mr-2 h-4 w-4 opacity-70" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function BoneTreeRow({
  row,
  isSelected,
  isHovered,
  hoveredConstraintId,
  isExpanded,
  previewTexture,
  dragSession,
  detachTargetKind,
  editorMode,
  onSelectBone,
  onSelectNode,
  onSelectConstraint,
  onHover,
  onClearHover,
  onToggleExpand,
  onToggleVisible,
  onToggleLink,
  onUnassignNode,
  onDetachBone,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onRenameBone,
  onRenameNode,
  onDeleteBone,
  onDeleteNode,
}) {
  const indent = row.depth * 14;
  const rowRef = useRef(null);
  const isContainerRow = row.kind === "root" || row.kind === "unassigned";
  const isDragOver = isContainerRow
    ? dragSession?.targetKind === row.kind && dragSession?.sourceId !== row.key
    : dragSession?.targetId === row.key && dragSession?.sourceId !== row.key;
  const dropPosition = isDragOver ? dragSession.dropPosition : null;
  const isStructureBlocked = editorMode === "animation";
  const dragAction =
    isDragOver && row.kind === "bone" && !isStructureBlocked
      ? dragSession?.sourceKind === "node"
        ? "assign"
        : dragSession?.sourceKind === "bone"
          ? "reparent"
          : null
      : null;

  const boneRename = useInlineRename({
    currentName: row.kind === "bone" ? row.bone?.name : "",
    onRename: (val) => onRenameBone?.(row.bone?.id, val),
  });

  const nodeRename = useInlineRename({
    currentName:
      row.kind === "node" || row.kind === "meshInfluence"
        ? row.node?.name || row.node?.id
        : "",
    onRename: (val) => onRenameNode?.(row.node?.id, val),
  });

  const rename =
    row.kind === "bone" ? boneRename : row.kind === "node" ? nodeRename : null;

  const handleDragOverRow = (e) => {
    e.preventDefault();
    onDragOver(
      row.kind === "bone" ? "bone" : row.kind === "node" ? "node" : row.kind,
      row.key,
    );
  };

  if (row.kind === "root" || row.kind === "unassigned") {
    const isRoot = row.kind === "root";
    const acceptsDrop = detachTargetKind === row.kind;
    return (
      <div
        ref={rowRef}
        className={[
          "relative flex items-center gap-1 rounded border border-dashed px-2 py-1.5 text-[10px] uppercase tracking-wider transition-colors",
          isDragOver && acceptsDrop && !isStructureBlocked
            ? "border-destructive/60 bg-destructive/10 text-destructive"
            : "border-border/60 bg-muted/10 text-muted-foreground hover:bg-muted/30",
        ].join(" ")}
        onDragOver={
          isStructureBlocked || !acceptsDrop
            ? undefined
            : (e) => {
                e.preventDefault();
                onDragOver(row.kind, null);
              }
        }
        onDragLeave={() => onDragOver(null, null)}
        onDrop={
          isStructureBlocked || !acceptsDrop
            ? undefined
            : (e) => {
                e.preventDefault();
                onDrop(row.kind, null);
              }
        }
      >
        {isRoot ? (
          <BoneIcon className="h-3 w-3" />
        ) : (
          <FileImage className="h-3 w-3" />
        )}
        <span>{isRoot ? "Root bones" : "Unassigned images"}</span>
        {isDragOver && acceptsDrop && (
          <span className="ml-auto rounded bg-destructive/15 px-1 py-0.5 text-[9px] normal-case tracking-normal text-destructive">
            {isRoot ? "Detach" : "Unassign"}
          </span>
        )}
      </div>
    );
  }

  if (row.kind === "bone") {
    const bone = row.bone;
    return (
      <RowContextMenu
        isStructureBlocked={isStructureBlocked}
        detachLabel={bone.parentId ? `Detach from ${row.parentName}` : null}
        onDetach={() => onDetachBone(bone.id)}
        onRename={() => rename?.startEdit()}
        onDelete={() => onDeleteBone(bone.id)}
      >
        <div
          ref={rowRef}
          draggable={!isStructureBlocked}
          className={[
            "relative flex items-center gap-1 px-2 py-1.5 text-sm rounded cursor-pointer transition-colors select-none border",
            isSelected
              ? "bg-primary/20 text-primary border-primary/40"
              : dragAction === "assign"
                ? "bg-sky-500/10 border-sky-500/30 text-sky-300"
                : dragAction === "reparent"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : isDragOver
                    ? "bg-accent border-accent-foreground/30"
                    : isHovered
                      ? "bg-sky-500/10 text-sky-200 border-sky-500/40"
                      : "hover:bg-muted text-foreground border-transparent",
          ].join(" ")}
          style={{ paddingLeft: 8 + indent }}
          onMouseEnter={() => onHover(`bone:${bone.id}`)}
          onMouseLeave={onClearHover}
          onClick={(e) => onSelectBone(bone.id, e)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            rename?.startEdit();
          }}
          onDragStart={
            isStructureBlocked
              ? undefined
              : (e) => onDragStart(e, "bone", bone.id)
          }
          onDragEnd={isStructureBlocked ? undefined : onDragEnd}
          onDragOver={isStructureBlocked ? undefined : handleDragOverRow}
          onDragLeave={() => onDragOver(null, null)}
          onDrop={
            isStructureBlocked
              ? undefined
              : (e) => {
                  e.preventDefault();
                  onDrop("bone", bone.id);
                }
          }
        >
          <button
            className="shrink-0 w-3 h-3 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20"
            disabled={!row.hasChildren}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(`bone:${bone.id}`);
            }}
          >
            <ChevronIcon open={isExpanded} />
          </button>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-background text-sky-300">
            <BoneIcon className="h-3.5 w-3.5" />
          </span>

          {rename?.isEditing ? (
            <InlineRenameInput
              value={rename.draft}
              onChange={rename.setDraft}
              onBlur={rename.handleBlur}
              onKeyDown={rename.handleKeyDown}
            />
          ) : (
            <span
              className="flex-1 truncate font-mono text-xs"
              title={bone.name}
            >
              {bone.name}
            </span>
          )}

          {row.ikConstraints?.map((constraint) => (
            <button
              type="button"
              key={constraint.id}
              className={[
                "inline-flex shrink-0 items-center gap-0.5 rounded border px-1 py-0.5 text-[9px] font-semibold transition-all",
                hoveredConstraintId === constraint.id
                  ? "border-current ring-1 ring-current/60 brightness-125"
                  : "border-transparent",
              ].join(" ")}
              style={{
                color: `#${(constraint.color ?? 0x22d3ee).toString(16).padStart(6, "0")}`,
                backgroundColor: `#${(constraint.color ?? 0x22d3ee).toString(16).padStart(6, "0")}22`,
              }}
              title={`${constraint.name}: affects this bone`}
              onMouseEnter={(event) => {
                event.stopPropagation();
                onHover(`constraint:${constraint.id}`);
              }}
              onMouseLeave={(event) => {
                event.stopPropagation();
                onHover(`bone:${bone.id}`);
              }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectConstraint(constraint.id);
              }}
            >
              <Crosshair size={9} />
              {constraint.name}
            </button>
          ))}
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground tabular-nums">
            {row.assignedCount}
          </span>

          {dragAction && (
            <span
              className={`absolute right-1 top-0.5 text-[9px] font-medium rounded px-1 py-0.5 ${
                dragAction === "assign"
                  ? "bg-sky-500/20 text-sky-300"
                  : "bg-amber-500/20 text-amber-300"
              }`}
            >
              {dragAction === "assign" ? "Assign" : "Reparent"}
            </span>
          )}
        </div>
      </RowContextMenu>
    );
  }

  const node = row.node;
  if (row.kind === "meshInfluence") {
    return (
      <RowContextMenu
        isStructureBlocked={isStructureBlocked}
        onRename={() => nodeRename.startEdit()}
        onDelete={() => onDeleteNode(node.id)}
      >
        <div
          role="button"
          tabIndex={0}
          className={[
            "relative flex w-full items-center gap-1.5 rounded border border-transparent py-0.5 pr-2 text-[10px] text-muted-foreground transition-colors",
            isSelected
              ? "bg-primary/15 text-primary"
              : isHovered
                ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                : "hover:bg-muted/60 hover:text-foreground",
          ].join(" ")}
          style={{ paddingLeft: 22 + indent }}
          onMouseEnter={() => onHover(node.id)}
          onMouseLeave={onClearHover}
          onClick={() => onSelectNode(node.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ")
              onSelectNode(node.id);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            nodeRename.startEdit();
          }}
          title={`${row.boneId} influences mesh ${node.name || node.id} through vertex weights`}
        >
          <Network className="h-3 w-3 shrink-0 text-violet-400" />
          <span className="shrink-0">Influences mesh</span>
          <span aria-hidden="true">→</span>
          <AssetAvatar
            src={previewTexture?.source}
            label={node.name || node.id}
            fallback={<PartIcon />}
          />
          {nodeRename.isEditing ? (
            <InlineRenameInput
              value={nodeRename.draft}
              onChange={nodeRename.setDraft}
              onBlur={nodeRename.handleBlur}
              onKeyDown={nodeRename.handleKeyDown}
            />
          ) : (
            <span className="truncate font-mono">{node.name || node.id}</span>
          )}
        </div>
      </RowContextMenu>
    );
  }

  const isVisible = node.visible !== false;
  const linkLocked = isBoneLinkLocked(node);

  return (
    <RowContextMenu
      isStructureBlocked={isStructureBlocked}
      detachLabel={row.boneId ? `Unassign from ${row.boneName}` : null}
      onDetach={() => onUnassignNode(node.id)}
      onRename={() => rename?.startEdit()}
      onDelete={() => onDeleteNode(node.id)}
    >
      <div
        ref={rowRef}
        draggable={!isStructureBlocked}
        className={[
          "relative flex items-center gap-1 px-2 py-1.5 text-sm rounded cursor-pointer transition-colors select-none border",
          isSelected
            ? "bg-primary/20 text-primary border-primary/40"
            : isHovered
              ? "bg-sky-500/10 text-sky-200 border-sky-500/40"
              : isDragOver
                ? "bg-accent border-accent-foreground/30"
                : "hover:bg-muted text-foreground border-transparent",
          !isVisible ? "opacity-50" : "",
        ].join(" ")}
        style={{ paddingLeft: 22 + indent }}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={onClearHover}
        onClick={() => onSelectNode(node.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          rename?.startEdit();
        }}
        onDragStart={
          isStructureBlocked
            ? undefined
            : (e) => onDragStart(e, "node", node.id)
        }
        onDragEnd={isStructureBlocked ? undefined : onDragEnd}
      >
        <AssetAvatar
          src={previewTexture?.source}
          label={node.name || node.id}
          fallback={<PartIcon />}
        />

        {rename?.isEditing ? (
          <InlineRenameInput
            value={rename.draft}
            onChange={rename.setDraft}
            onBlur={rename.handleBlur}
            onKeyDown={rename.handleKeyDown}
          />
        ) : (
          <span
            className="flex-1 truncate font-mono text-xs"
            title={node.name || node.id}
          >
            {node.name || node.id}
          </span>
        )}

        {row.boneId && (
          <button
            type="button"
            disabled={isStructureBlocked}
            className={[
              "shrink-0 w-5 h-5 flex items-center justify-center rounded-sm transition-colors",
              isStructureBlocked
                ? "cursor-not-allowed opacity-40 text-muted-foreground/40"
                : linkLocked
                  ? "text-sky-300 hover:bg-foreground/10"
                  : "text-muted-foreground/40 hover:bg-foreground/10 hover:text-muted-foreground",
            ].join(" ")}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLink(node.id, !linkLocked);
            }}
            title={
              isStructureBlocked
                ? "Switch to Staging mode to toggle link."
                : linkLocked
                  ? "Linked transform on"
                  : "Linked transform off"
            }
            aria-label={
              linkLocked ? "Linked transform on" : "Linked transform off"
            }
          >
            {linkLocked ? <Link2 size={12} /> : <Unlink2 size={12} />}
          </button>
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

        {isDragOver && dropPosition && (
          <span className="absolute -left-0.5 top-0 h-full w-0.5 rounded bg-primary" />
        )}
      </div>
    </RowContextMenu>
  );
}
