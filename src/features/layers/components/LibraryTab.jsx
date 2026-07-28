import { FolderPlus, Loader2, Settings, Sparkles, Upload } from 'lucide-react';
import { useState } from 'react';

import { useImportSettingsStore } from '@/store/importSettingsStore';

import { loadExampleProjectFile } from '@/features/projects';

import { BorderBeam } from '@/components/ui/border-beam';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';

import { LibraryAssetRow } from './rows/LibraryAssetRow.jsx';
import { LibraryFolderRow } from './rows/LibraryFolderRow.jsx';

export function LibraryTab({
  tree,
  expandedFolderIds,
  dragSession,
  selection,
  dragActive,
  onToggleFolderExpand,
  onCreateFolder,
  onRenameFolder,
  onRenameAsset,
  onRemoveFolder,
  onRemoveAsset,
  onDragStartAsset,
  onDragStartFolder,
  onDragOverRow,
  onDropRow,
  onDragEnter,
  onDragOverBackground,
  onDragLeave,
  onDropBackground,
  onSelect,
  onImportClick,
  onLoadExampleProject,
}) {
  const isEmpty = tree.length === 0;
  const [isLoadingExample, setIsLoadingExample] = useState(false);
  const [exampleError, setExampleError] = useState('');
  const [removalTarget, setRemovalTarget] = useState(null);
  const autoAddToCanvas = useImportSettingsStore(state => state.autoAddToCanvas);
  const setAutoAddToCanvas = useImportSettingsStore(state => state.setAutoAddToCanvas);

  const handleLoadExample = async () => {
    setIsLoadingExample(true);
    setExampleError('');
    try {
      const file = await loadExampleProjectFile();
      onLoadExampleProject?.(file);
    } catch (error) {
      setExampleError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingExample(false);
    }
  };

  const handleConfirmRemoval = () => {
    const target = removalTarget;
    if (!target) return;
    setRemovalTarget(null);
    globalThis.setTimeout(() => {
      if (target.kind === 'asset') onRemoveAsset?.(target.id);
      else onRemoveFolder?.(target.id);
    }, 0);
  };

  function renderRows(rows, depth = 0) {
    return rows.map(row => {
      if (row.kind === 'folder') {
        const isExpanded = expandedFolderIds.has(row.id);
        return (
          <div key={row.id}>
            <LibraryFolderRow
              folder={row}
              isExpanded={isExpanded}
              dragSession={dragSession}
              depth={depth}
              onToggleExpand={onToggleFolderExpand}
              onRename={onRenameFolder}
              onRemove={() => requestAnimationFrame(() => setRemovalTarget({ kind: 'folder', id: row.id, name: row.name }))}
              onDragStart={onDragStartFolder}
              onDragOver={onDragOverRow}
              onDrop={onDropRow}
              onSelect={onSelect}
            />
            {isExpanded && row.children && row.children.length > 0 && (
              <div>{renderRows(row.children, depth + 1)}</div>
            )}
          </div>
        );
      }
      return (
        <LibraryAssetRow
          key={row.id}
          asset={row}
          isSelected={selection.includes(row.id)}
          dragSession={dragSession}
          depth={depth}
          onSelect={onSelect}
          onRename={onRenameAsset}
          onRemove={() => requestAnimationFrame(() => setRemovalTarget({ kind: 'asset', id: row.id, name: row.name }))}
          onDragStart={onDragStartAsset}
          onDragOver={onDragOverRow}
          onDrop={onDropRow}
        />
      );
    });
  }

  return (
    <>
      <div className="flex h-8 items-center gap-1 border-b px-2 shrink-0">
        <button
          type="button"
          onClick={onImportClick}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Import artwork"
        >
          <Upload className="h-3 w-3" />
          Import
        </button>
        <button
          type="button"
          onClick={onCreateFolder}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Add New Folder"
        >
          <FolderPlus className="h-3 w-3" />
          New Folder
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
              title="Library import settings"
              aria-label="Library import settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-72 p-3">
            <div className="mb-3">
              <p className="text-xs font-semibold">Import settings</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">Controls artwork imported with button or dropped into Library.</p>
            </div>
            <div className="flex items-start gap-3 rounded border bg-muted/20 p-2.5">
              <Switch
                id="library-auto-add-to-canvas"
                checked={autoAddToCanvas}
                onCheckedChange={setAutoAddToCanvas}
                aria-label="Automatically add imported artwork to canvas"
                className="mt-0.5"
              />
              <label htmlFor="library-auto-add-to-canvas" className="min-w-0 cursor-pointer">
                <span className="block text-xs font-medium">Auto-add to canvas</span>
                <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                  {autoAddToCanvas
                    ? 'Imported artwork appears in Library and on canvas.'
                    : 'Imported artwork stays in Library until placed or used as replacement.'}
                </span>
              </label>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <ScrollArea
        className={`flex-1 transition-colors ${dragActive ? 'bg-primary/5' : ''}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOverBackground}
        onDragLeave={onDragLeave}
        onDrop={onDropBackground}
      >
        <div className="p-1 space-y-0.5">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded border border-border bg-background text-muted-foreground">
                <Upload className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">Import artwork</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Drop PNG or PSD files here.
                </p>
              </div>
              <button
                type="button"
                onClick={onImportClick}
                className="inline-flex h-7 items-center gap-1.5 rounded border border-border bg-background px-2 text-[11px] font-medium text-foreground hover:bg-muted"
              >
                <Upload className="h-3.5 w-3.5" />
                Import
              </button>
              <button
                type="button"
                onClick={handleLoadExample}
                disabled={isLoadingExample}
                className="relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded border border-primary/30 bg-background px-3 text-[11px] font-medium text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-60"
              >
                <BorderBeam duration={3.5} />
                {isLoadingExample
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Sparkles className="h-3.5 w-3.5 text-primary" />}
                Load example project
              </button>
              {exampleError && (
                <p role="alert" className="max-w-48 text-[10px] text-destructive">{exampleError}</p>
              )}
            </div>
          ) : (
            renderRows(tree)
          )}
        </div>
      </ScrollArea>

      <AlertDialog open={Boolean(removalTarget)} onOpenChange={(open) => { if (!open) setRemovalTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from library?</AlertDialogTitle>
            <AlertDialogDescription>
              {removalTarget?.kind === 'folder'
                ? `This will permanently delete “${removalTarget.name}”, its subfolders, and its assets. Any instances of those assets will also be removed from the canvas. This action cannot be undone.`
                : `This will permanently delete “${removalTarget?.name}” from Library. Any instances of this asset will also be removed from the canvas. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemoval}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove from library
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
