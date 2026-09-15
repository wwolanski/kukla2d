import { CheckCircle2, Circle, SkipForward } from 'lucide-react';

import { Button } from '@/components/ui/button.jsx';

export function MotionBindingRows({
  presetRoles,
  nodes,
  selectedPart,
  bindings,
  pickingRole,
  onChange,
  onCanvasPick,
  onCancelCanvasPick,
  disabled,
}) {
  const entries = Object.entries(presetRoles ?? {});

  const handleUseSelected = (roleKey, _isRequired) => {
    if (!selectedPart) return;
    onChange(roleKey, { nodeId: selectedPart.id, skipped: false });
  };

  const handleSkip = (roleKey) => {
    onChange(roleKey, { nodeId: null, skipped: true });
  };

  const handleRemove = (roleKey) => {
    onChange(roleKey, { nodeId: null, skipped: false });
  };

  return (
    <div className="space-y-2">
      {entries.map(([roleKey, roleDef]) => {
        const binding = bindings?.[roleKey];
        const isBound = binding?.nodeId && !binding?.skipped;
        const isSkipped = binding?.skipped;
        const boundNode = isBound ? nodes.find(n => n.id === binding.nodeId) : null;
        const isPicking = pickingRole === roleKey;

        return (
          <div
            key={roleKey}
            className={[
              'rounded border px-2 py-1.5 space-y-1',
              isPicking ? 'border-amber-400 bg-amber-500/10' : '',
            ].join(' ')}
          >
            <div className="flex items-center gap-1.5">
              {isBound ? (
                <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
              ) : (
                <Circle className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
              <span className="text-xs font-medium capitalize">{roleDef.role}</span>
              {roleDef.required && (
                <span className="text-[9px] text-muted-foreground bg-muted px-1 rounded">Required</span>
              )}
            </div>

            {isBound && boundNode ? (
              <div className="flex items-center gap-1 pl-5">
                <span className="text-[10px] text-muted-foreground truncate flex-1">
                  {boundNode.name}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4"
                  onClick={() => handleRemove(roleKey)}
                  disabled={disabled}
                  title="Remove binding"
                >
                  <Circle className="h-2.5 w-2.5" />
                </Button>
              </div>
            ) : isSkipped ? (
              <div className="flex items-center gap-1 pl-5">
                <span className="text-[10px] text-muted-foreground italic">Skipped</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4"
                  onClick={() => handleRemove(roleKey)}
                  disabled={disabled}
                  title="Unskip"
                >
                  <Circle className="h-2.5 w-2.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1 pl-5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 text-[10px] px-1.5"
                  disabled={!selectedPart || disabled}
                  onClick={() => handleUseSelected(roleKey, roleDef.required)}
                >
                  Use selected layer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 text-[10px] px-1.5"
                  disabled={disabled}
                  onClick={() => onCanvasPick?.(roleKey)}
                >
                  Select on canvas
                </Button>
                {!roleDef.required && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[10px] px-1.5 gap-0.5"
                    disabled={disabled}
                    onClick={() => handleSkip(roleKey)}
                  >
                    <SkipForward className="h-2.5 w-2.5" />
                    Skip
                  </Button>
                )}
              </div>
            )}
            {isPicking && (
              <div className="flex items-center justify-between gap-2 pl-5">
                <span className="text-[10px] text-amber-700 dark:text-amber-300">
                  Pick a part in the canvas.
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px]"
                  onClick={onCancelCanvasPick}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
