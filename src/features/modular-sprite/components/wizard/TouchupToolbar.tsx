import {
  CircleOff,
  Eraser,
  MousePointer2,
  Paintbrush,
  Scissors,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { MODULAR_SPRITE_PROCESSING_CONFIG } from "@kukla2d/contracts";

import { cn } from "@/lib/utils";

import { FeatureDisabledTooltip } from "@/components/ui/feature-disabled-tooltip";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { EditorTool } from "../preview/ModularSpritePreviewCanvas.types.js";

const UiSlider = Slider as React.ComponentType<{
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  value: number[];
  onValueChange: (value: number[]) => void;
  "aria-label"?: string;
  className?: string;
}>;
const UiTooltipContent = TooltipContent as React.ComponentType<{
  children: React.ReactNode;
  side?: string;
}>;
const UiFeatureDisabledTooltip = FeatureDisabledTooltip as React.ComponentType<{
  children: React.ReactNode;
  side?: string;
}>;

const TOUCHUP_TOOLS_DISABLED = true;

const TOUCHUP_TOOLS = [
  {
    tool: "select",
    label: "Select regions",
    description: "Select a detected region in the preview.",
    icon: MousePointer2,
  },
  {
    tool: "foreground",
    label: "Keep foreground",
    description: "Paint pixels that should remain part of the foreground.",
    icon: Paintbrush,
  },
  {
    tool: "background",
    label: "Erase background",
    description: "Paint pixels that should be removed from the foreground.",
    icon: Eraser,
  },
  {
    tool: "split",
    label: "Split regions",
    description: "Paint a separation through touching regions.",
    icon: Scissors,
  },
  {
    tool: "enclosed-fill",
    label: "Remove enclosed area",
    description: "Mark an enclosed key-colored pocket for removal.",
    icon: CircleOff,
  },
] as const satisfies ReadonlyArray<{
  tool: EditorTool;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}>;

function TouchupToolbarButton({
  active,
  ariaLabel,
  children,
  description,
  disabled = false,
  expanded,
  featureDisabled,
  onClick,
}: {
  active?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
  description: string;
  disabled?: boolean;
  expanded?: boolean;
  featureDisabled: boolean;
  onClick?: () => void;
}): React.ReactElement {
  const unavailable = featureDisabled || disabled;
  const button = (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-disabled={unavailable}
      aria-pressed={active}
      aria-expanded={expanded}
      disabled={featureDisabled ? undefined : disabled}
      title={featureDisabled ? undefined : description}
      onClick={unavailable ? undefined : onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active &&
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        unavailable &&
          "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground",
      )}
    >
      {children}
    </button>
  );

  if (featureDisabled) {
    return (
      <UiFeatureDisabledTooltip side="right">{button}</UiFeatureDisabledTooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <UiTooltipContent side="right">
        <div className="grid gap-0.5">
          <span>{ariaLabel}</span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </div>
      </UiTooltipContent>
    </Tooltip>
  );
}

export function TouchupToolbar({
  tool,
  brushRadius,
  enclosedChromaSeedCount,
  onToolChange,
  onBrushRadiusChange,
  onClearEnclosedAreas,
  featureDisabled = TOUCHUP_TOOLS_DISABLED,
}: {
  tool: EditorTool;
  brushRadius: number;
  enclosedChromaSeedCount: number;
  onToolChange: (tool: EditorTool) => void;
  onBrushRadiusChange: (value: number) => void;
  onClearEnclosedAreas: () => void;
  featureDisabled?: boolean;
}): React.ReactElement {
  const [showBrushSettings, setShowBrushSettings] = useState(false);
  const brushParameter = MODULAR_SPRITE_PROCESSING_CONFIG.strokes.editorRadius;

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className="flex flex-col items-center gap-1 rounded-md border border-border/70 bg-background/95 p-1 shadow-xl backdrop-blur"
        data-testid="modular-sprite-touchup-toolbar"
      >
        {TOUCHUP_TOOLS.map((item) => {
          const Icon = item.icon;
          const active = tool === item.tool;
          return (
            <TouchupToolbarButton
              key={item.tool}
              active={active}
              ariaLabel={item.label}
              description={item.description}
              featureDisabled={featureDisabled}
              onClick={() => onToolChange(item.tool)}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </TouchupToolbarButton>
          );
        })}

        <div className="my-1 h-px w-6 bg-border/70" />

        <div className="relative">
          <TouchupToolbarButton
            active={showBrushSettings}
            ariaLabel="Brush radius"
            description={`Brush radius: ${(brushRadius * 100).toFixed(1)}%`}
            expanded={showBrushSettings}
            featureDisabled={featureDisabled}
            onClick={() => setShowBrushSettings((visible) => !visible)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
          </TouchupToolbarButton>
          {showBrushSettings && (
            <div className="absolute left-full top-0 z-30 ml-2 w-52 rounded-md border border-border/70 bg-background/95 p-3 shadow-xl backdrop-blur">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Brush radius</span>
                <span className="font-medium tabular-nums">
                  {(brushRadius * 100).toFixed(1)}%
                </span>
              </div>
              <UiSlider
                aria-label="Brush radius"
                min={brushParameter.min}
                max={brushParameter.max}
                step={brushParameter.step}
                disabled={featureDisabled}
                value={[brushRadius]}
                onValueChange={(nextValue) =>
                  onBrushRadiusChange(nextValue[0] ?? brushRadius)
                }
              />
            </div>
          )}
        </div>

        <TouchupToolbarButton
          ariaLabel="Clear manual enclosed areas"
          description="Clear manual areas"
          disabled={enclosedChromaSeedCount === 0}
          featureDisabled={featureDisabled}
          onClick={onClearEnclosedAreas}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </TouchupToolbarButton>
      </div>
    </TooltipProvider>
  );
}
