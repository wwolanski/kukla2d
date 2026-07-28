import { lazy, Suspense, useState } from 'react';

import { TextureReplacementModal } from '@/features/texture-replacement';

import { BoneTreeTab } from './BoneTreeTab.jsx';
import { DepthTab } from './DepthTab.jsx';
import { useLayerPanelController } from '../application/useLayerPanelController.js';

const LibraryTab = lazy(() => import('./LibraryTab.jsx').then(m => ({ default: m.LibraryTab })));

export function LayerPanel({ onImportClick, onImportFiles, onLoadExampleProject }) {
  const { shared, tabs, library, depth, bones } = useLayerPanelController({ onImportClick, onImportFiles });
  const [replaceTexturesOpen, setReplaceTexturesOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b shrink-0">
        {['library', 'depth', 'groups'].map(tab => (
          <button
            key={tab}
            className={`flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${tabs.active === tab
              ? 'text-foreground border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => tabs.setActive(tab)}
          >
            {tab === 'library' ? 'Library' : tab === 'depth' ? 'DRAW ORDER' : 'Bones'}
          </button>
        ))}
      </div>

      {tabs.active === 'library' && (
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
          onLoadExampleProject={onLoadExampleProject}
          />
        </Suspense>
      )}

      {tabs.active === 'depth' && (
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

      {tabs.active === 'groups' && (
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
      <TextureReplacementModal open={replaceTexturesOpen} onOpenChange={setReplaceTexturesOpen} />
    </div>
  );
}
