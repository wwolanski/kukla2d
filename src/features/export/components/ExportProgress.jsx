import { Button } from '@/components/ui/button.jsx';
import { DialogFooter } from '@/components/ui/dialog.jsx';
import { Progress } from '@/components/ui/progress.jsx';

export function ExportProgress({ progress, exportError, isExporting, onClose, onCancel, onExport }) {
  return (
    <div className="shrink-0 space-y-3 border-t pt-4">
      {exportError && (
        <div className="text-xs text-red-600 dark:text-red-400 px-2 py-1.5 rounded bg-red-50 dark:bg-red-900/20">
          <span className="font-medium">Export failed:</span> {exportError}
        </div>
      )}

      {progress && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.label}</span>
            <span>
              {progress.current}/{progress.total}
            </span>
          </div>
          <Progress value={Math.round((progress.current / progress.total) * 100)} />
        </div>
      )}

      <DialogFooter>
        <Button
          variant="outline"
          size="sm"
          onClick={isExporting ? onCancel : onClose}
          disabled={isExporting && !onCancel}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={onExport} disabled={isExporting}>
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </DialogFooter>
    </div>
  );
}
