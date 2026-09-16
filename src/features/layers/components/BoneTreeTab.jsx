import { ArrowLeftRight, EyeOff, Images, Rows3 } from "lucide-react";
import { useState } from "react";

import { BoneTreeRow } from "@/features/layers/components/rows/BoneTreeRow.jsx";
import { findNodePreviewTexture } from "@/features/layers/domain/findNodePreviewTexture.js";

import { ScrollArea } from "@/components/ui/scroll-area.js";

function groupRowsByRootFamily(rows) {
  const groups = [];
  for (const row of rows) {
    const familyId = row.familyId ?? null;
    const previous = groups.at(-1);
    if (familyId && previous?.familyId === familyId) {
      previous.rows.push(row);
    } else {
      groups.push({
        key: familyId ? `family:${familyId}` : row.key,
        familyId,
        rows: [row],
      });
    }
  }
  return groups;
}

export function BoneTreeTab({
  rows,
  allNodes,
  textureMap,
  selection,
  hoverHit,
  activeBoneId,
  expanded,
  allExpanded,
  showImages,
  dragSession,
  editorMode,
  onSelectBone,
  onSelectNode,
  onSelectConstraint,
  onHover,
  onClearHover,
  onToggleExpand,
  onToggleAll,
  onToggleImages,
  onReplaceTextures,
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
  const [panelHoverFamilyId, setPanelHoverFamilyId] = useState(null);
  const draggedRow = dragSession
    ? rows.find((row) =>
        dragSession.sourceKind === "bone"
          ? row.kind === "bone" && row.bone.id === dragSession.sourceId
          : row.kind === "node" && row.node.id === dragSession.sourceId,
      )
    : null;
  const detachTarget =
    draggedRow?.kind === "bone" && draggedRow.bone.parentId
      ? { kind: "root", label: "Detach from parent" }
      : draggedRow?.kind === "node" && draggedRow.boneId
        ? { kind: "unassigned", label: "Make unassigned" }
        : null;
  const hoveredConstraintId =
    typeof hoverHit === "string" && hoverHit.startsWith("constraint:")
      ? hoverHit.slice("constraint:".length)
      : null;
  const canvasHoverFamilyIds = new Set(
    rows
      .filter((row) => {
        if (row.kind === "bone") {
          if (hoverHit === `bone:${row.bone.id}`) return true;
          return row.ikConstraints?.some(
            (constraint) =>
              constraint.id === hoveredConstraintId &&
              constraint.assignedBoneId === row.bone.id,
          );
        }
        return (
          (row.kind === "node" || row.kind === "meshInfluence") &&
          hoverHit === row.node.id
        );
      })
      .map((row) => row.familyId)
      .filter(Boolean),
  );
  const selectedFamilyIds = new Set(
    rows
      .filter((row) =>
        row.kind === "bone"
          ? activeBoneId === row.bone.id || selection.includes(row.bone.id)
          : (row.kind === "node" || row.kind === "meshInfluence") &&
            selection.includes(row.node.id),
      )
      .map((row) => row.familyId)
      .filter(Boolean),
  );
  const rowGroups = groupRowsByRootFamily(rows);

  const clearPanelHover = () => {
    setPanelHoverFamilyId(null);
    onClearHover();
  };
  const renderRow = (row) => (
    <BoneTreeRow
      key={row.key}
      row={row}
      previewTexture={
        row.node ? findNodePreviewTexture(row.node, allNodes, textureMap) : null
      }
      isSelected={
        row.kind === "bone"
          ? activeBoneId === row.bone.id || selection.includes(row.bone.id)
          : row.kind === "node" || row.kind === "meshInfluence"
            ? selection.includes(row.node.id)
            : false
      }
      isHovered={
        row.kind === "bone"
          ? hoverHit === `bone:${row.bone.id}` ||
            row.ikConstraints?.some(
              (constraint) =>
                constraint.id === hoveredConstraintId &&
                constraint.assignedBoneId === row.bone.id,
            )
          : (row.kind === "node" || row.kind === "meshInfluence") &&
            hoverHit === row.node.id
      }
      hoveredConstraintId={hoveredConstraintId}
      isExpanded={
        row.kind === "bone" ? expanded.has(`bone:${row.bone.id}`) : false
      }
      dragSession={dragSession}
      detachTargetKind={detachTarget?.kind ?? null}
      editorMode={editorMode}
      onSelectBone={onSelectBone}
      onSelectNode={onSelectNode}
      onSelectConstraint={onSelectConstraint}
      onHover={(hit) => {
        setPanelHoverFamilyId(row.familyId ?? null);
        onHover(hit);
      }}
      onClearHover={clearPanelHover}
      onToggleExpand={onToggleExpand}
      onToggleVisible={onToggleVisible}
      onToggleLink={onToggleLink}
      onUnassignNode={onUnassignNode}
      onDetachBone={onDetachBone}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onRenameBone={onRenameBone}
      onRenameNode={onRenameNode}
      onDeleteBone={onDeleteBone}
      onDeleteNode={onDeleteNode}
    />
  );
  return (
    <>
      <div className="flex h-8 min-w-0 shrink-0 items-center border-b px-2">
        <button
          type="button"
          aria-pressed={allExpanded}
          className={`layer-panel-toolbar-button inline-flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded px-1.5 text-[10px] font-medium transition-colors hover:bg-muted ${
            allExpanded
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={onToggleAll}
          title={allExpanded ? "Collapse all bone rows" : "Show all bone rows"}
        >
          <Rows3 className="h-3 w-3 shrink-0" />
          <span className="layer-panel-toolbar-label truncate">
            {allExpanded ? "Collapse all" : "Show all"}
          </span>
        </button>
        <button
          type="button"
          aria-pressed={showImages}
          className={`layer-panel-toolbar-button ml-1 inline-flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded px-1.5 text-[10px] font-medium transition-colors hover:bg-muted ${
            showImages
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={onToggleImages}
          title={
            showImages
              ? "Hide image rows in the bone tree"
              : "Show image rows in the bone tree"
          }
        >
          {showImages ? (
            <EyeOff className="h-3 w-3 shrink-0" />
          ) : (
            <Images className="h-3 w-3 shrink-0" />
          )}
          <span className="layer-panel-toolbar-label truncate">
            {showImages ? "Hide images" : "Show images"}
          </span>
        </button>
        <button
          type="button"
          className="layer-panel-toolbar-button ml-1 inline-flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          onClick={onReplaceTextures}
          disabled={editorMode === "animation"}
          title={
            editorMode === "animation"
              ? "Texture replacement is locked in Animation mode"
              : "Replace one or many textures from Library"
          }
        >
          <ArrowLeftRight className="h-3 w-3 shrink-0" />
          <span className="layer-panel-toolbar-label truncate">Replace</span>
        </button>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1" onMouseLeave={clearPanelHover}>
        <div className="min-w-0 w-full space-y-0.5 p-1">
          {rowGroups.map((group) => {
            if (!group.familyId) return renderRow(group.rows[0]);
            const showsFamilyLine = group.rows.length > 1;
            const familyHovered =
              panelHoverFamilyId === group.familyId ||
              canvasHoverFamilyIds.has(group.familyId);
            const familySelected = selectedFamilyIds.has(group.familyId);
            return (
              <div key={group.key} className="flex min-w-0 items-stretch gap-1">
                <span className="relative w-2 shrink-0" aria-hidden="true">
                  {showsFamilyLine && (
                    <span
                      className={[
                        "pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full transition-all",
                        familyHovered
                          ? "w-0.5 bg-sky-400 shadow-[0_0_5px_rgba(56,189,248,0.9)]"
                          : familySelected
                            ? "w-0.5 bg-primary/80"
                            : "w-px bg-border/65",
                      ].join(" ")}
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  {group.rows.map(renderRow)}
                </div>
              </div>
            );
          })}
          {detachTarget && (
            <div
              className="mt-2 flex h-12 items-center justify-center rounded border border-dashed border-destructive/60 bg-destructive/10 text-[10px] font-semibold text-destructive"
              onDragOver={(event) => {
                event.preventDefault();
                onDragOver(detachTarget.kind, null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                onDrop(detachTarget.kind, null);
              }}
            >
              {detachTarget.label}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
