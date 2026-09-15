import { useState, useEffect, useCallback } from 'react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog.jsx';

export function MarkerDialog({ open, onOpenChange, currentFrame, onConfirm }) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (open) {
      setLabel(`F${currentFrame}`);
    }
  }, [open, currentFrame]);

  const handleSubmit = useCallback(() => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    onOpenChange(false);
  }, [label, onConfirm, onOpenChange]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px]">
        <DialogHeader>
          <DialogTitle>Add Marker</DialogTitle>
          <DialogDescription>
            Name this marker at frame {currentFrame}.
          </DialogDescription>
        </DialogHeader>
        <input
          autoFocus
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Marker label"
          className="flex h-9 w-full rounded border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <DialogFooter>
          <DialogClose asChild>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded border border-border bg-background px-3 text-xs font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </DialogClose>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!label.trim()}
            className="inline-flex h-8 items-center justify-center rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            Add
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
