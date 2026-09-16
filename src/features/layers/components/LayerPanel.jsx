import { lazy, Suspense, useState } from "react";

import { useLayerPanelController } from "@/features/layers/application/useLayerPanelController.js";
import { BoneTreeTab } from "@/features/layers/components/BoneTreeTab.jsx";
import { DepthTab } from "@/features/layers/components/DepthTab.jsx";
import { TextureReplacementModal } from "@/features/texture-replacement/index.js";

const LibraryTab = lazy(() =>
  import("@/features/layers/components/LibraryTab.jsx").then((m) => ({
    default: m.LibraryTab,
  })),
);

export function LayerPanelView({
  getDragImage,
  onImportClick,
  onImportFiles,
  onImportModularSprite,
  onRegenerateModularSprite,
  onLoadExampleProject,
}) {
  const { shared, tabs, library, depth, bones } = useLayerPanelController({
    getDragImage,
    onImportClick,
    onImportFiles,
    onImportModularSprite,
    onRegenerateModularSprite,
  });
  const [replaceTexturesOpen, setReplaceTexturesOpen] = useState(false);

  return (
    <div className="layer-panel-root flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex min-w-0 shrink-0 items-center border-b">
        {["library", "depth", "groups"].map((tab) => (
          <button
            key={tab}
            className={`min-w-0 flex-1 truncate py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              tabs.active === tab
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => tabs.setActive(tab)}
          >
            {tab === "library"
              ? "Library"
              : tab === "depth"
                ? "DRAW ORDER"
                : "Bones"}
          </button>
        ))}
      </div>

      {tabs.active === "library" && (
        <Suspense fallback={null}>
          <LibraryTab
            tree={library.tree}
            expandedFolderIds={library.expandedFolderIds}
            dragSession={library.dragSession}
            selection={shared.selection}
            dragActive={library.dragActive}
            onToggleFolderExpand={library.onToggleFolderExpand}
            onCreateFolder={library.onCreateFolder}
            onRenameFolder={library.onRenameFolder}
            onRenameAsset={library.onRenameAsset}
            onRemoveFolder={library.onRemoveFolder}
            onRemoveFromPackage={library.onRemoveFromPackage}
            onRemoveAsset={library.onRemoveAsset}
            onDragStartAsset={library.onDragStartAsset}
            onDragStartFolder={library.onDragStartFolder}
            onDragOverRow={library.onDragOverRow}
            onDropRow={library.onDropRow}
            onDragEnter={library.onDragEnter}
            onDragOverBackground={library.onDragOverBackground}
            onDragLeave={library.onDragLeave}
            onDropBackground={library.onDropBackground}
            onSelect={library.onSelect}
            onImportClick={library.onImportClick}
            onImportModularSprite={library.onImportModularSprite}
            onRegenerateModularSprite={library.onRegenerateModularSprite}
            onLoadExampleProject={onLoadExampleProject}
          />
        </Suspense>
      )}

      {tabs.active === "depth" && (
        <DepthTab
          nodes={depth.nodes}
          allNodes={shared.nodes}
          textureMap={shared.textureMap}
          selection={shared.selection}
          dragSession={depth.dragSession}
          editorMode={depth.editorMode}
          onSelect={depth.onSelect}
          onHover={depth.onHover}
          onClearHover={depth.onClearHover}
          onToggleVisible={depth.onToggleVisible}
          onDragStart={depth.onDragStart}
          onDragOver={depth.onDragOver}
          onDrop={depth.onDrop}
          onDuplicate={depth.onDuplicate}
          onDelete={depth.onDelete}
          onRename={depth.onRename}
        />
      )}

      {tabs.active === "groups" && (
        <BoneTreeTab
          rows={bones.rows}
          allNodes={shared.nodes}
          textureMap={shared.textureMap}
          selection={shared.selection}
          hoverHit={shared.hoverHit}
          activeBoneId={bones.activeBoneId}
          expanded={bones.expanded}
          allExpanded={bones.allExpanded}
          showImages={bones.showImages}
          dragSession={bones.dragSession}
          editorMode={bones.editorMode}
          onSelectBone={bones.onSelectBone}
          onSelectNode={bones.onSelectNode}
          onSelectConstraint={bones.onSelectConstraint}
          onHover={bones.onHover}
          onClearHover={bones.onClearHover}
          onToggleExpand={bones.onToggleExpand}
          onToggleAll={bones.onToggleAll}
          onToggleImages={bones.onToggleImages}
          onReplaceTextures={() => setReplaceTexturesOpen(true)}
          onToggleVisible={bones.onToggleVisible}
          onToggleLink={bones.onToggleLink}
          onUnassignNode={bones.onUnassignNode}
          onDetachBone={bones.onDetachBone}
          onDragStart={bones.onDragStart}
          onDragEnd={bones.onDragEnd}
          onDragOver={bones.onDragOver}
          onDrop={bones.onDrop}
          onRenameBone={bones.onRenameBone}
          onRenameNode={bones.onRenameNode}
          onDeleteBone={bones.onDeleteBone}
          onDeleteNode={bones.onDeleteNode}
        />
      )}
      <TextureReplacementModal
        open={replaceTexturesOpen}
        onOpenChange={setReplaceTexturesOpen}
      />
    </div>
  );
}
