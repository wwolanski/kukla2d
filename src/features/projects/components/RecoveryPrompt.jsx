import { useState, useEffect, useCallback } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog.jsx';

export function RecoveryPrompt({ record, error, onRestore, onDiscard }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setOpen(!!record);
  }, [record]);

  const handleRestore = useCallback(async () => {
    setPending(true);
    const restored = await onRestore?.(record);
    setPending(false);
    if (restored !== false) setOpen(false);
  }, [onRestore, record]);

  const handleDiscard = useCallback(async () => {
    setPending(true);
    const discarded = await onDiscard?.();
    setPending(false);
    if (discarded !== false) setOpen(false);
  }, [onDiscard]);

  const handleOpenChange = useCallback((nextOpen) => {
    if (!nextOpen) return;
    setOpen(nextOpen);
  }, []);

  const savedAt = record?.savedAt;
  const formattedTime = savedAt
    ? new Date(savedAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '';

  const projectName = record?.sourceProjectName || 'Untitled project';

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent data-recovery-prompt="true">
        <AlertDialogHeader>
          <AlertDialogTitle>Recover unsaved work?</AlertDialogTitle>
          <AlertDialogDescription>
            An unsaved recovery was found from {formattedTime}
            {projectName !== 'Untitled project' ? ` for "${projectName}"` : ''}.
            Would you like to restore it or discard?
          </AlertDialogDescription>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDiscard} disabled={pending} data-recovery-discard="true">
            Discard
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleRestore} disabled={pending} data-recovery-restore="true">
            {pending ? 'Working…' : 'Restore'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
