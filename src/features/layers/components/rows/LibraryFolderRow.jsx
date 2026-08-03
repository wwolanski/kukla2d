import { FolderX, Pencil } from 'lucide-react';
import { useRef } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

import { useInlineRename } from '../../application/useInlineRename.js';
import { computeDropPosition } from '../../domain/dragSession.js';
import { InlineRenameInput } from '../shared/InlineRenameInput.jsx';
import { ChevronIcon } from '../shared/LayerPanelPrimitives.jsx';

export function LibraryFolderRow({ folder, isExpanded, dragSession, depth, onToggleExpand, onRename, onRemove, onDragStart, onDragOver, onDrop }) {
  const rowRef = useRef(null);
  const isDragOver = dragSession?.targetId === folder.id && dragSession?.sourceId !== folder.id;
  const dropPosition = isDragOver ? dragSession.dropPosition : null;

  const { isEditing, draft, setDraft, startEdit, handleKeyDown, handleBlur } = useInlineRename({
    currentName: folder.name,
    onRename: (val) => onRename?.(folder.id, val),
  });

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = rowRef.current?.getBoundingClientRect();
    const pos = computeDropPosition({ clientY: e.clientY, top: rect?.top, height: rect?.height }, 'inside');
    onDragOver?.('folder', folder.id, pos);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDrop?.('folder', folder.id);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
    <div
      ref={rowRef}
      draggable
      className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded cursor-pointer transition-colors select-none
        ${isDragOver
          ? 'bg-accent border border-accent-foreground/30'
          : 'hover:bg-muted text-foreground border border-transparent'
        }
      `}
      style={{ paddingLeft: `${(depth ?? 0) * 16 + 8}px` }}
      onClick={() => onToggleExpand?.(folder.id)}
      onDoubleClick={(e) => { e.stopPropagation(); startEdit(); }}
      onDragStart={(e) => onDragStart?.(e, folder.id)}
      onDragOver={handleDragOver}
      onDragLeave={() => onDragOver?.(null, null)}
      onDrop={handleDrop}
    >
      <ChevronIcon open={isExpanded} />

      <span className="shrink-0 text-muted-foreground">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M2 4.5V11h10V5.5H7.5L6 4H2z" />
        </svg>
      </span>

      {isEditing ? (
        <InlineRenameInput
          value={draft}
          onChange={setDraft}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <span className="flex-1 truncate font-mono text-xs" title={folder.name}>
          {folder.name}
        </span>
      )}

      {folder.sourceFileName && (
        <span className="shrink-0 text-[9px] text-muted-foreground/50 truncate max-w-[80px]" title={folder.sourceFileName}>
          {folder.sourceFileName}
        </span>
      )}

      {isDragOver && dropPosition === 'inside' && (
        <span className="absolute inset-0 rounded border-2 border-primary/40 pointer-events-none" />
      )}
    </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
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
          Remove from library
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
