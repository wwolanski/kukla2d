import { AlertTriangle, RotateCcw, Download } from 'lucide-react';

import { Button } from '@/components/ui/button.jsx';

export default function CanvasFailureFallback({ failure, onRetry, recoveryArchive }) {
  if (!failure) return null;

  const handleDownloadRecovery = () => {
    if (!recoveryArchive) return;
    const url = URL.createObjectURL(recoveryArchive);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recovery.kk2d';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm"
      data-canvas-failure="true"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex flex-col items-center gap-4 max-w-sm text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            Canvas unavailable
          </h2>
          <p className="text-sm text-muted-foreground">
            {failure.message}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRetry}
            data-canvas-retry="true"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Retry canvas
          </Button>
          {recoveryArchive && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleDownloadRecovery}
              data-canvas-download-recovery="true"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Download recovery
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => window.location.reload()}
            data-canvas-reload="true"
          >
            Reload application
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground/60">
          Kukla2D {__APP_VERSION__}
        </p>
      </div>
    </div>
  );
}
