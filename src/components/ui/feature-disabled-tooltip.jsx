import { AlertTriangle } from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.jsx';

export function FeatureDisabledTooltip({ children, side = 'bottom' }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs space-y-1.5 py-2.5 px-3">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
            <span className="text-xs font-semibold text-yellow-500">Feature disabled</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            This feature is experimental and has been disabled in Kukla2D {__APP_VERSION__}.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
