import {
  ChevronDown,
  Eraser,
  MousePointer2,
  Paintbrush,
  Pipette,
  Scissors,
} from "lucide-react";

import {
  MODULAR_SPRITE_PROCESSING_CONFIG,
  resolveChromaRefinement,
  type ModularSpriteEnclosedChromaMode,
  type ModularSpriteProcessingRecipe,
} from "@kukla2d/contracts";

import { Button } from "@/components/ui/button";
import { HelpIcon } from "@/components/ui/help-icon";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";

import type { EditorTool } from "../preview/ModularSpritePreviewCanvas.types.js";

const UiButton = Button as React.ComponentType<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }
>;
const UiSlider = Slider as React.ComponentType<{
  min?: number;
  max?: number;
  step?: number;
  value: number[];
  onValueChange: (value: number[]) => void;
  onValueCommit?: (value: number[]) => void;
  "aria-label"?: string;
}>;

type SliderParameter = {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly digits: number;
};

function colorToHex(color: { r: number; g: number; b: number }): string {
  return `#${[color.r, color.g, color.b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function hexToColor(value: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

function ParameterField({
  label,
  help,
  children,
}: {
  label: React.ReactNode;
  help: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <HelpIcon tip={help} side="right" />
      </div>
      {children}
    </div>
  );
}

function SliderField({
  name,
  help,
  value,
  parameter,
  onChange,
  onCommit,
  formatValue,
}: {
  name: string;
  help: string;
  value: number;
  parameter: SliderParameter;
  onChange: (value: number) => void;
  onCommit?: () => void;
  formatValue?: (value: number) => string;
}): React.ReactElement {
  const displayedValue =
    formatValue?.(value) ?? value.toFixed(parameter.digits);
  return (
    <ParameterField label={`${name}: ${displayedValue}`} help={help}>
      <UiSlider
        aria-label={name}
        min={parameter.min}
        max={parameter.max}
        step={parameter.step}
        value={[value]}
        onValueChange={(nextValue) => onChange(nextValue[0] ?? value)}
        {...(onCommit ? { onValueCommit: () => onCommit() } : {})}
      />
    </ParameterField>
  );
}

function ProcessingSection({
  title,
  help,
  children,
  defaultOpen = false,
  separated = true,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  separated?: boolean;
}): React.ReactElement {
  return (
    <details
      className={`group space-y-3 ${separated ? "border-t pt-3" : ""}`}
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-foreground">
        <ChevronDown
          className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
        <span>{title}</span>
        <span
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <HelpIcon tip={help} side="right" />
        </span>
      </summary>
      <div className="space-y-3">{children}</div>
    </details>
  );
}

export function BackgroundStep({
  recipe,
  tool,
  brushRadius,
  warnings,
  onRecipeChange,
  onRecipeCommit,
  onToolChange,
  onBrushRadiusChange,
  onPickMode,
  onClearEnclosedAreas,
}: {
  recipe: ModularSpriteProcessingRecipe;
  tool: EditorTool;
  brushRadius: number;
  warnings: readonly string[];
  onRecipeChange: (
    change: (recipe: ModularSpriteProcessingRecipe) => void,
    process?: boolean,
  ) => void;
  onRecipeCommit: () => void;
  onToolChange: (tool: EditorTool) => void;
  onBrushRadiusChange: (value: number) => void;
  onPickMode: () => void;
  onClearEnclosedAreas: () => void;
}): React.ReactElement {
  const config = MODULAR_SPRITE_PROCESSING_CONFIG;
  const refinement = resolveChromaRefinement(recipe.background);
  const enclosedChromaSeedCount = refinement.enclosedChromaSeeds.length;

  return (
    <ScrollArea className="h-full min-h-0 min-w-0 rounded-lg border">
      <aside className="space-y-3 p-4">
        <ProcessingSection
          defaultOpen
          separated={false}
          title="Background keying"
          help="Choose how the transparent mask is created: from the source alpha or by removing a sampled background color."
        >
          <ParameterField
            label="Mode"
            help="Use existing alpha for images that already contain transparency, or Chroma key to remove a selected color."
          >
            <select
              aria-label="Mode"
              className="h-9 w-full rounded-md border bg-background px-2"
              value={recipe.background.mode}
              onChange={(event) =>
                onRecipeChange((draft) => {
                  draft.background.mode = event.target.value as
                    "alpha" | "chroma";
                })
              }
            >
              <option value="alpha">Existing alpha</option>
              <option value="chroma">Chroma key</option>
            </select>
          </ParameterField>
          <ParameterField
            label="Background color"
            help="The color removed when Chroma key mode is active. Sample it directly from the preview with the pipette button."
          >
            <div className="flex items-center gap-2">
              <input
                aria-label="Background color"
                className="h-9 min-w-0 flex-1 rounded-md border bg-background p-1"
                type="color"
                value={colorToHex(recipe.background.color)}
                onChange={(event) =>
                  onRecipeChange((draft) => {
                    draft.background.color = hexToColor(event.target.value);
                  })
                }
              />
              <UiButton
                aria-label="Pick background color from image"
                className="h-9 w-9 p-0"
                size="sm"
                title="Pick background color from image"
                type="button"
                variant={tool === "eyedropper" ? "default" : "outline"}
                onClick={onPickMode}
              >
                <Pipette className="h-4 w-4" aria-hidden="true" />
              </UiButton>
            </div>
          </ParameterField>
          <SliderField
            name="Tolerance"
            help="How far a pixel may be from the background color before it remains opaque. Higher values remove more."
            parameter={config.background.tolerance}
            value={recipe.background.tolerance}
            onChange={(value) =>
              onRecipeChange((draft) => {
                draft.background.tolerance = value;
              }, false)
            }
            onCommit={onRecipeCommit}
          />
          <SliderField
            name="Soft edge"
            help="Adds a gradual alpha transition around the tolerance boundary instead of a hard cut."
            parameter={config.background.softness}
            value={recipe.background.softness}
            onChange={(value) =>
              onRecipeChange((draft) => {
                draft.background.softness = value;
              }, false)
            }
            onCommit={onRecipeCommit}
          />
        </ProcessingSection>

        <ProcessingSection
          defaultOpen
          title="Protect island interiors"
          help="Keeps the inset interior of closed part silhouettes opaque while allowing enclosed background-colored pockets to be tuned separately."
        >
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={refinement.protectIslandInteriors}
                onChange={(event) =>
                  onRecipeChange((draft) => {
                    draft.background.protectIslandInteriors =
                      event.target.checked;
                  })
                }
              />
              Protect island interiors
            </label>
            <HelpIcon
              tip="Turn this on to restore opaque pixels inside closed foreground shapes. Open background areas and background brush strokes stay transparent."
              side="right"
            />
          </div>
          <SliderField
            name="Interior inset"
            help="Pixels kept between the detected edge and the protected core. Higher values leave a wider edge area to the keyer."
            parameter={config.background.interiorProtectionInset}
            value={refinement.interiorProtectionInset}
            formatValue={(value) => `${value}px`}
            onChange={(value) =>
              onRecipeChange((draft) => {
                draft.background.interiorProtectionInset = value;
              }, false)
            }
            onCommit={onRecipeCommit}
          />
          <ParameterField
            label="Enclosed chroma inside protected areas"
            help="Controls how background-colored pockets inside protected islands are handled. Open background areas are not affected."
          >
            <select
              aria-label="Enclosed chroma inside protected areas"
              className="h-9 w-full rounded-md border bg-background px-2"
              value={refinement.enclosedChromaMode}
              onChange={(event) =>
                onRecipeChange((draft) => {
                  draft.background.enclosedChromaMode = event.target
                    .value as ModularSpriteEnclosedChromaMode;
                })
              }
            >
              <option value="transparent">Remove (transparent)</option>
              <option value="black">Fill black</option>
              <option value="desaturate">Desaturate</option>
              <option value="preserve">Preserve</option>
            </select>
          </ParameterField>
          {refinement.protectIslandInteriors ? (
            <details className="space-y-3">
              <summary className="flex cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground">
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Enclosed chroma tuning</span>
                <span
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                >
                  <HelpIcon
                    tip="Core detection is restrictive; growth only cleans a neighboring fringe that also matches the key color and hue."
                    side="right"
                  />
                </span>
              </summary>
              <div className="space-y-3 pl-3">
                <SliderField
                  name="Core alpha maximum"
                  help="Maximum matte alpha for pixels considered the core of an enclosed background-colored pocket."
                  parameter={config.background.enclosedChromaCoreAlphaMax}
                  value={refinement.enclosedChromaCoreAlphaMax}
                  onChange={(value) =>
                    onRecipeChange((draft) => {
                      draft.background.enclosedChromaCoreAlphaMax = value;
                    }, false)
                  }
                  onCommit={onRecipeCommit}
                />
                <SliderField
                  name="Core color tolerance"
                  help="How close a pocket's core color must be to the sampled background color."
                  parameter={config.background.enclosedChromaCoreColorTolerance}
                  value={refinement.enclosedChromaCoreColorTolerance}
                  onChange={(value) =>
                    onRecipeChange((draft) => {
                      draft.background.enclosedChromaCoreColorTolerance = value;
                    }, false)
                  }
                  onCommit={onRecipeCommit}
                />
                <SliderField
                  name="Growth radius"
                  help="How many pixels the enclosed-pocket detector may grow beyond its core."
                  parameter={config.background.enclosedChromaGrowthRadius}
                  value={refinement.enclosedChromaGrowthRadius}
                  formatValue={(value) => `${value}px`}
                  onChange={(value) =>
                    onRecipeChange((draft) => {
                      draft.background.enclosedChromaGrowthRadius = value;
                    }, false)
                  }
                  onCommit={onRecipeCommit}
                />
                <SliderField
                  name="Growth alpha maximum"
                  help="Maximum alpha for neighboring pixels eligible to join an enclosed pocket."
                  parameter={config.background.enclosedChromaGrowthAlphaMax}
                  value={refinement.enclosedChromaGrowthAlphaMax}
                  onChange={(value) =>
                    onRecipeChange((draft) => {
                      draft.background.enclosedChromaGrowthAlphaMax = value;
                    }, false)
                  }
                  onCommit={onRecipeCommit}
                />
                <SliderField
                  name="Growth color tolerance"
                  help="Maximum weighted color distance accepted while growing an enclosed pocket."
                  parameter={
                    config.background.enclosedChromaGrowthColorTolerance
                  }
                  value={refinement.enclosedChromaGrowthColorTolerance}
                  onChange={(value) =>
                    onRecipeChange((draft) => {
                      draft.background.enclosedChromaGrowthColorTolerance =
                        value;
                    }, false)
                  }
                  onCommit={onRecipeCommit}
                />
                <SliderField
                  name="Growth chroma tolerance"
                  help="Maximum colorfulness distance accepted while growing an enclosed pocket."
                  parameter={
                    config.background.enclosedChromaGrowthChromaTolerance
                  }
                  value={refinement.enclosedChromaGrowthChromaTolerance}
                  onChange={(value) =>
                    onRecipeChange((draft) => {
                      draft.background.enclosedChromaGrowthChromaTolerance =
                        value;
                    }, false)
                  }
                  onCommit={onRecipeCommit}
                />
                <SliderField
                  name="Growth hue tolerance"
                  help="Maximum hue difference accepted while growing an enclosed pocket."
                  parameter={config.background.enclosedChromaGrowthHueTolerance}
                  value={refinement.enclosedChromaGrowthHueTolerance}
                  onChange={(value) =>
                    onRecipeChange((draft) => {
                      draft.background.enclosedChromaGrowthHueTolerance = value;
                    }, false)
                  }
                  onCommit={onRecipeCommit}
                />
                <SliderField
                  name="Minimum chroma ratio"
                  help="Minimum colorfulness, relative to the sampled background, required during growth."
                  parameter={
                    config.background.enclosedChromaGrowthMinChromaRatio
                  }
                  value={refinement.enclosedChromaGrowthMinChromaRatio}
                  onChange={(value) =>
                    onRecipeChange((draft) => {
                      draft.background.enclosedChromaGrowthMinChromaRatio =
                        value;
                    }, false)
                  }
                  onCommit={onRecipeCommit}
                />
                <UiButton
                  className="w-full"
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() =>
                    onRecipeChange((draft) => {
                      draft.background.enclosedChromaCoreAlphaMax =
                        config.background.enclosedChromaCoreAlphaMax.default;
                      draft.background.enclosedChromaCoreColorTolerance =
                        config.background.enclosedChromaCoreColorTolerance.default;
                      draft.background.enclosedChromaGrowthRadius =
                        config.background.enclosedChromaGrowthRadius.default;
                      draft.background.enclosedChromaGrowthAlphaMax =
                        config.background.enclosedChromaGrowthAlphaMax.default;
                      draft.background.enclosedChromaGrowthColorTolerance =
                        config.background.enclosedChromaGrowthColorTolerance.default;
                      draft.background.enclosedChromaGrowthChromaTolerance =
                        config.background.enclosedChromaGrowthChromaTolerance.default;
                      draft.background.enclosedChromaGrowthHueTolerance =
                        config.background.enclosedChromaGrowthHueTolerance.default;
                      draft.background.enclosedChromaGrowthMinChromaRatio =
                        config.background.enclosedChromaGrowthMinChromaRatio.default;
                    })
                  }
                >
                  Reset enclosed chroma tuning
                </UiButton>
              </div>
            </details>
          ) : null}
        </ProcessingSection>

        <ProcessingSection
          title="Edge cleanup"
          help="Refine semi-transparent edges after keying: reduce background spill, remove weak matte pixels, and recover nearby foreground colors."
        >
          <SliderField
            name="Despill"
            help="Reduces the sampled background color bleeding into semi-transparent foreground edges."
            parameter={config.background.despill}
            value={recipe.background.despill}
            onChange={(value) =>
              onRecipeChange((draft) => {
                draft.background.despill = value;
              }, false)
            }
            onCommit={onRecipeCommit}
          />
          <SliderField
            name="Matte choke"
            help="Removes the weakest semi-transparent matte pixels without eroding solid foreground pixels."
            parameter={config.background.matteChoke}
            value={refinement.matteChoke}
            onChange={(value) =>
              onRecipeChange((draft) => {
                draft.background.matteChoke = value;
              }, false)
            }
            onCommit={onRecipeCommit}
          />
          <SliderField
            name="Edge color recovery"
            help="Replaces background-contaminated edge RGB with nearby confident foreground color."
            parameter={config.background.edgeColorRecovery}
            value={refinement.edgeColorRecovery}
            onChange={(value) =>
              onRecipeChange((draft) => {
                draft.background.edgeColorRecovery = value;
              }, false)
            }
            onCommit={onRecipeCommit}
          />
          <SliderField
            name="Edge search"
            help="How far to look for a confident foreground color when recovering an edge."
            parameter={config.background.edgeSearchRadius}
            value={refinement.edgeSearchRadius}
            formatValue={(value) => `${value}px`}
            onChange={(value) =>
              onRecipeChange((draft) => {
                draft.background.edgeSearchRadius = value;
              }, false)
            }
            onCommit={onRecipeCommit}
          />
        </ProcessingSection>

        <ProcessingSection
          title="Region detection"
          help="Turn the matte into connected regions for later part assignment. These controls affect region detection, not the initial background key."
        >
          <SliderField
            name="Detection alpha"
            help="Alpha cutoff used to turn the matte into regions for connected-component detection."
            parameter={config.detection.alphaThreshold}
            value={recipe.detection.alphaThreshold}
            onChange={(value) =>
              onRecipeChange((draft) => {
                draft.detection.alphaThreshold = value;
              }, false)
            }
            onCommit={onRecipeCommit}
          />
          <SliderField
            name="Opening radius"
            help="Removes small isolated pixels and narrow protrusions before regions are detected."
            parameter={config.detection.openingRadius}
            value={recipe.detection.openingRadius}
            formatValue={(value) => `${value}px`}
            onChange={(value) =>
              onRecipeChange((draft) => {
                draft.detection.openingRadius = value;
              }, false)
            }
            onCommit={onRecipeCommit}
          />
          <SliderField
            name="Closing radius"
            help="Fills small gaps and closes narrow holes before regions are detected."
            parameter={config.detection.closingRadius}
            value={recipe.detection.closingRadius}
            formatValue={(value) => `${value}px`}
            onChange={(value) =>
              onRecipeChange((draft) => {
                draft.detection.closingRadius = value;
              }, false)
            }
            onCommit={onRecipeCommit}
          />
          <SliderField
            name="Minimum island"
            help="Smallest detected region kept as a part, expressed as a percentage of the image area."
            parameter={config.detection.minimumRegionAreaRatio}
            value={recipe.detection.minimumRegionAreaRatio}
            formatValue={(value) =>
              `${(value * 100).toFixed(config.detection.minimumRegionAreaRatio.digits - 2)}%`
            }
            onChange={(value) =>
              onRecipeChange((draft) => {
                draft.detection.minimumRegionAreaRatio = value;
              }, false)
            }
            onCommit={onRecipeCommit}
          />
        </ProcessingSection>

        {warnings.map((warning) => (
          <p
            key={warning}
            className="rounded bg-amber-500/10 p-2 text-xs text-amber-500"
          >
            {warning}
          </p>
        ))}

        <ProcessingSection
          title="Touch-up tools"
          help="Use the preview tools to paint foreground or background corrections, split regions, and remove enclosed background-colored areas manually."
        >
          <div className="grid grid-cols-2 gap-2">
            <UiButton
              size="sm"
              type="button"
              variant={tool === "select" ? "default" : "outline"}
              onClick={() => onToolChange("select")}
            >
              <MousePointer2 className="mr-1 h-4 w-4" />
              Select
            </UiButton>
            <UiButton
              size="sm"
              type="button"
              variant={tool === "foreground" ? "default" : "outline"}
              onClick={() => onToolChange("foreground")}
            >
              <Paintbrush className="mr-1 h-4 w-4" />
              Keep
            </UiButton>
            <UiButton
              size="sm"
              type="button"
              variant={tool === "background" ? "default" : "outline"}
              onClick={() => onToolChange("background")}
            >
              <Eraser className="mr-1 h-4 w-4" />
              Erase
            </UiButton>
            <UiButton
              size="sm"
              type="button"
              variant={tool === "split" ? "default" : "outline"}
              onClick={() => onToolChange("split")}
            >
              <Scissors className="mr-1 h-4 w-4" />
              Split
            </UiButton>
            <UiButton
              size="sm"
              type="button"
              variant={tool === "enclosed-fill" ? "default" : "outline"}
              onClick={() => onToolChange("enclosed-fill")}
            >
              <MousePointer2 className="mr-1 h-4 w-4" />
              Remove enclosed area
            </UiButton>
          </div>
          <UiButton
            className="w-full"
            disabled={enclosedChromaSeedCount === 0}
            size="sm"
            type="button"
            variant="outline"
            onClick={onClearEnclosedAreas}
          >
            Clear manual areas
            {enclosedChromaSeedCount > 0 ? ` (${enclosedChromaSeedCount})` : ""}
          </UiButton>
          <SliderField
            name="Brush radius"
            help="Size of Keep, Erase, and Split strokes on the preview."
            parameter={config.strokes.editorRadius}
            value={brushRadius}
            formatValue={(value) => `${(value * 100).toFixed(1)}%`}
            onChange={onBrushRadiusChange}
          />
        </ProcessingSection>
      </aside>
    </ScrollArea>
  );
}
