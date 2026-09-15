import { cn } from '@/lib/utils.js';

import { FeatureDisabledTooltip } from '@/components/ui/feature-disabled-tooltip.jsx';

export function TransportButton({ onClick, active, title, children, className = '', disabled, featureDisabled = false }) {
  const buttonElement = (
    <button
      onClick={featureDisabled ? undefined : onClick}
      title={featureDisabled ? undefined : title}
      disabled={featureDisabled ? false : disabled}
      className={cn(
        'flex items-center justify-center w-6 h-6 rounded text-xs transition-colors',
        featureDisabled
          ? 'opacity-50 cursor-not-allowed'
          : active
            ? (className.includes('bg-') ? '' : 'bg-primary text-primary-foreground')
            : 'text-muted-foreground hover:text-foreground hover:bg-muted',
        disabled && !featureDisabled && 'opacity-30 cursor-not-allowed pointer-events-none',
        className
      )}
    >
      {children}
    </button>
  );

  if (featureDisabled) {
    return (
      <FeatureDisabledTooltip>
        {buttonElement}
      </FeatureDisabledTooltip>
    );
  }

  return buttonElement;
}
