import { Copy, Sparkles, Trash2 } from 'lucide-react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { FeatureDisabledTooltip } from '@/components/ui/feature-disabled-tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';

import { DepthRow } from './rows/DepthRow.jsx';
import { findNodePreviewTexture } from '../domain/findNodePreviewTexture.js';

export function DepthTab({
  nodes,
  allNodes,
  textureMap,
  selection,
  dragSession,
  editorMode,
  onSelect,
  onHover,
  onClearHover,
  onToggleVisible,
  onDragStart,
  onDragOver,
  onDrop,
  onDuplicate,
  onDelete,
  onRename,
}) {
  const isStructureBlocked = editorMode === 'animation';
  return (
    <>
      <div className="flex h-8 items-center border-b px-2 shrink-0">
        <FeatureDisabledTooltip>
          <button
            type="button"
            className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-medium text-muted-foreground opacity-50 cursor-not-allowed transition-colors"
          >
            <Sparkles className="h-3 w-3" />
            Smart auto-order
          </button>
        </FeatureDisabledTooltip>
      </div>

      <ScrollArea className="flex-1" onMouseLeave={onClearHover}>
        <div className="p-1 space-y-0.5">
          {nodes.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">No layers yet.</p>
          ) : (
            nodes.map(node => (
              <ContextMenu key={node.id}>
                <ContextMenuTrigger>
                  <DepthRow
                    node={node}
                    previewTexture={findNodePreviewTexture(node, allNodes, textureMap)}
                    isSelected={selection.includes(node.id)}
                    dragSession={dragSession}
                    onSelect={onSelect}
                    onHover={onHover}
                    onClearHover={onClearHover}
                    onToggleVisible={onToggleVisible}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onRename={onRename}
                  />
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  <ContextMenuItem disabled={isStructureBlocked} onSelect={() => onDuplicate(node.id)}>
                    <Copy className="w-4 h-4 mr-2 opacity-70" />
                    Duplicate
                  </ContextMenuItem>

                  <ContextMenuItem
                    disabled={isStructureBlocked}
                    className="text-destructive focus:text-destructive"
                    onSelect={() => onDelete(node.id)}
                  >
                    <Trash2 className="w-4 h-4 mr-2 opacity-70" />
                    Remove from canvas
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))
          )}
        </div>
      </ScrollArea>
    </>
  );
}
