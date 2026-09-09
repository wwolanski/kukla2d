import { Eraser, MousePointer2, Paintbrush, Scissors } from "lucide-react";

import {
  MODULAR_SPRITE_PROCESSING_CONFIG,
  resolveChromaRefinement,
  type ModularSpriteEnclosedChromaMode,
  type ModularSpriteProcessingRecipe,
} from "@kukla2d/contracts";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

import { FieldLabel } from "./FieldLabel.js";

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
}>;

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
    <aside className="space-y-4 overflow-auto rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">
        The keyer removes the background color (or uses existing alpha) and
        finds connected regions. Use the touch-up tools below to fix the mask.
      </p>
      <FieldLabel>
        Mode
        <select
          className="h-9 rounded-md border bg-background px-2"
          value={recipe.background.mode}
          onChange={(event) =>
            onRecipeChange((draft) => {
              draft.background.mode = event.target.value as "alpha" | "chroma";
            })
          }
        >
          <option value="alpha">Existing alpha</option>
          <option value="chroma">Chroma key</option>
        </select>
      </FieldLabel>
      <FieldLabel>
        Background color
        <input
          className="h-9 w-full"
          type="color"
          value={colorToHex(recipe.background.color)}
          onChange={(event) =>
            onRecipeChange((draft) => {
              draft.background.color = hexToColor(event.target.value);
            })
          }
        />
      </FieldLabel>
      <UiButton
        size="sm"
        variant={tool === "eyedropper" ? "default" : "outline"}
        onClick={onPickMode}
      >
        Pick from image
      </UiButton>
      <FieldLabel>
        Tolerance:{" "}
        {recipe.background.tolerance.toFixed(
          config.background.tolerance.digits,
        )}
        <UiSlider
          min={config.background.tolerance.min}
          max={config.background.tolerance.max}
          step={config.background.tolerance.step}
          value={[recipe.background.tolerance]}
          onValueChange={(value) =>
            onRecipeChange((draft) => {
              draft.background.tolerance =
                value[0] ?? draft.background.tolerance;
            }, false)
          }
          onValueCommit={onRecipeCommit}
        />
      </FieldLabel>
      <FieldLabel>
        Soft edge:{" "}
        {recipe.background.softness.toFixed(config.background.softness.digits)}
        <UiSlider
          min={config.background.softness.min}
          max={config.background.softness.max}
          step={config.background.softness.step}
          value={[recipe.background.softness]}
          onValueChange={(value) =>
            onRecipeChange((draft) => {
              draft.background.softness = value[0] ?? draft.background.softness;
            }, false)
          }
          onValueCommit={onRecipeCommit}
        />
      </FieldLabel>
      <FieldLabel>
        Despill:{" "}
        {recipe.background.despill.toFixed(config.background.despill.digits)}
        <UiSlider
          min={config.background.despill.min}
          max={config.background.despill.max}
          step={config.background.despill.step}
          value={[recipe.background.despill]}
          onValueChange={(value) =>
            onRecipeChange((draft) => {
              draft.background.despill = value[0] ?? draft.background.despill;
            }, false)
          }
          onValueCommit={onRecipeCommit}
        />
      </FieldLabel>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={refinement.protectIslandInteriors}
          onChange={(event) =>
            onRecipeChange((draft) => {
              draft.background.protectIslandInteriors = event.target.checked;
            })
          }
        />
        Protect island interiors
      </label>
      <p className="text-xs text-muted-foreground">
        Keeps the inset interior of closed part silhouettes opaque while
        allowing enclosed key-color pockets to be tuned separately. Open areas
        and background brush strokes stay transparent.
      </p>
      {refinement.protectIslandInteriors ? (
        <details className="space-y-3 rounded-md border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            Enclosed chroma tuning
          </summary>
          <p className="text-xs text-muted-foreground">
            Core detection is restrictive; growth only cleans a neighboring
            fringe that also matches the key color and hue.
          </p>
          <FieldLabel>
            Core alpha maximum:{" "}
            {refinement.enclosedChromaCoreAlphaMax.toFixed(
              config.background.enclosedChromaCoreAlphaMax.digits,
            )}
            <UiSlider
              min={config.background.enclosedChromaCoreAlphaMax.min}
              max={config.background.enclosedChromaCoreAlphaMax.max}
              step={config.background.enclosedChromaCoreAlphaMax.step}
              value={[refinement.enclosedChromaCoreAlphaMax]}
              onValueChange={(value) =>
                onRecipeChange((draft) => {
                  draft.background.enclosedChromaCoreAlphaMax =
                    value[0] ?? refinement.enclosedChromaCoreAlphaMax;
                }, false)
              }
              onValueCommit={onRecipeCommit}
            />
          </FieldLabel>
          <FieldLabel>
            Core color tolerance:{" "}
            {refinement.enclosedChromaCoreColorTolerance.toFixed(
              config.background.enclosedChromaCoreColorTolerance.digits,
            )}
            <UiSlider
              min={config.background.enclosedChromaCoreColorTolerance.min}
              max={config.background.enclosedChromaCoreColorTolerance.max}
              step={config.background.enclosedChromaCoreColorTolerance.step}
              value={[refinement.enclosedChromaCoreColorTolerance]}
              onValueChange={(value) =>
                onRecipeChange((draft) => {
                  draft.background.enclosedChromaCoreColorTolerance =
                    value[0] ?? refinement.enclosedChromaCoreColorTolerance;
                }, false)
              }
              onValueCommit={onRecipeCommit}
            />
          </FieldLabel>
          <FieldLabel>
            Growth radius:{" "}
            {refinement.enclosedChromaGrowthRadius.toFixed(
              config.background.enclosedChromaGrowthRadius.digits,
            )}
            <UiSlider
              min={config.background.enclosedChromaGrowthRadius.min}
              max={config.background.enclosedChromaGrowthRadius.max}
              step={config.background.enclosedChromaGrowthRadius.step}
              value={[refinement.enclosedChromaGrowthRadius]}
              onValueChange={(value) =>
                onRecipeChange((draft) => {
                  draft.background.enclosedChromaGrowthRadius =
                    value[0] ?? refinement.enclosedChromaGrowthRadius;
                }, false)
              }
              onValueCommit={onRecipeCommit}
            />
          </FieldLabel>
          <FieldLabel>
            Growth alpha maximum:{" "}
            {refinement.enclosedChromaGrowthAlphaMax.toFixed(
              config.background.enclosedChromaGrowthAlphaMax.digits,
            )}
            <UiSlider
              min={config.background.enclosedChromaGrowthAlphaMax.min}
              max={config.background.enclosedChromaGrowthAlphaMax.max}
              step={config.background.enclosedChromaGrowthAlphaMax.step}
              value={[refinement.enclosedChromaGrowthAlphaMax]}
              onValueChange={(value) =>
                onRecipeChange((draft) => {
                  draft.background.enclosedChromaGrowthAlphaMax =
                    value[0] ?? refinement.enclosedChromaGrowthAlphaMax;
                }, false)
              }
              onValueCommit={onRecipeCommit}
            />
          </FieldLabel>
          <FieldLabel>
            Growth color tolerance:{" "}
            {refinement.enclosedChromaGrowthColorTolerance.toFixed(
              config.background.enclosedChromaGrowthColorTolerance.digits,
            )}
            <UiSlider
              min={config.background.enclosedChromaGrowthColorTolerance.min}
              max={config.background.enclosedChromaGrowthColorTolerance.max}
              step={config.background.enclosedChromaGrowthColorTolerance.step}
              value={[refinement.enclosedChromaGrowthColorTolerance]}
              onValueChange={(value) =>
                onRecipeChange((draft) => {
                  draft.background.enclosedChromaGrowthColorTolerance =
                    value[0] ?? refinement.enclosedChromaGrowthColorTolerance;
                }, false)
              }
              onValueCommit={onRecipeCommit}
            />
          </FieldLabel>
          <FieldLabel>
            Growth chroma tolerance:{" "}
            {refinement.enclosedChromaGrowthChromaTolerance.toFixed(
              config.background.enclosedChromaGrowthChromaTolerance.digits,
            )}
            <UiSlider
              min={config.background.enclosedChromaGrowthChromaTolerance.min}
              max={config.background.enclosedChromaGrowthChromaTolerance.max}
              step={config.background.enclosedChromaGrowthChromaTolerance.step}
              value={[refinement.enclosedChromaGrowthChromaTolerance]}
              onValueChange={(value) =>
                onRecipeChange((draft) => {
                  draft.background.enclosedChromaGrowthChromaTolerance =
                    value[0] ?? refinement.enclosedChromaGrowthChromaTolerance;
                }, false)
              }
              onValueCommit={onRecipeCommit}
            />
          </FieldLabel>
          <FieldLabel>
            Growth hue tolerance:{" "}
            {refinement.enclosedChromaGrowthHueTolerance.toFixed(
              config.background.enclosedChromaGrowthHueTolerance.digits,
            )}
            <UiSlider
              min={config.background.enclosedChromaGrowthHueTolerance.min}
              max={config.background.enclosedChromaGrowthHueTolerance.max}
              step={config.background.enclosedChromaGrowthHueTolerance.step}
              value={[refinement.enclosedChromaGrowthHueTolerance]}
              onValueChange={(value) =>
                onRecipeChange((draft) => {
                  draft.background.enclosedChromaGrowthHueTolerance =
                    value[0] ?? refinement.enclosedChromaGrowthHueTolerance;
                }, false)
              }
              onValueCommit={onRecipeCommit}
            />
          </FieldLabel>
          <FieldLabel>
            Minimum chroma ratio:{" "}
            {refinement.enclosedChromaGrowthMinChromaRatio.toFixed(
              config.background.enclosedChromaGrowthMinChromaRatio.digits,
            )}
            <UiSlider
              min={config.background.enclosedChromaGrowthMinChromaRatio.min}
              max={config.background.enclosedChromaGrowthMinChromaRatio.max}
              step={config.background.enclosedChromaGrowthMinChromaRatio.step}
              value={[refinement.enclosedChromaGrowthMinChromaRatio]}
              onValueChange={(value) =>
                onRecipeChange((draft) => {
                  draft.background.enclosedChromaGrowthMinChromaRatio =
                    value[0] ?? refinement.enclosedChromaGrowthMinChromaRatio;
                }, false)
              }
              onValueCommit={onRecipeCommit}
            />
          </FieldLabel>
          <UiButton
            className="w-full"
            size="sm"
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
        </details>
      ) : null}
      <FieldLabel>
        Enclosed chroma inside protected areas
        <select
          aria-label="Enclosed chroma inside protected areas"
          className="h-9 rounded-md border bg-background px-2"
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
      </FieldLabel>
      <p className="text-xs text-muted-foreground">
        Automatic enclosed-chroma handling applies only inside the protected
        area; open background areas are not affected.
      </p>
      <p className="text-xs text-muted-foreground">
        Overlay: <span className="text-fuchsia-400">magenta</span> is the
        protected area, <span className="text-cyan-300">cyan</span> is
        recognized enclosed chroma.
      </p>
      <FieldLabel>
        Interior inset: {refinement.interiorProtectionInset}px
        <UiSlider
          min={config.background.interiorProtectionInset.min}
          max={config.background.interiorProtectionInset.max}
          step={config.background.interiorProtectionInset.step}
          value={[refinement.interiorProtectionInset]}
          onValueChange={(value) =>
            onRecipeChange((draft) => {
              draft.background.interiorProtectionInset =
                value[0] ??
                draft.background.interiorProtectionInset ??
                config.background.interiorProtectionInset.default;
            }, false)
          }
          onValueCommit={onRecipeCommit}
        />
      </FieldLabel>
      <FieldLabel>
        Matte choke:{" "}
        {refinement.matteChoke.toFixed(config.background.matteChoke.digits)}
        <UiSlider
          min={config.background.matteChoke.min}
          max={config.background.matteChoke.max}
          step={config.background.matteChoke.step}
          value={[refinement.matteChoke]}
          onValueChange={(value) =>
            onRecipeChange((draft) => {
              draft.background.matteChoke =
                value[0] ??
                draft.background.matteChoke ??
                config.background.matteChoke.default;
            }, false)
          }
          onValueCommit={onRecipeCommit}
        />
      </FieldLabel>
      <FieldLabel>
        Edge color recovery:{" "}
        {refinement.edgeColorRecovery.toFixed(
          config.background.edgeColorRecovery.digits,
        )}
        <UiSlider
          min={config.background.edgeColorRecovery.min}
          max={config.background.edgeColorRecovery.max}
          step={config.background.edgeColorRecovery.step}
          value={[refinement.edgeColorRecovery]}
          onValueChange={(value) =>
            onRecipeChange((draft) => {
              draft.background.edgeColorRecovery =
                value[0] ??
                draft.background.edgeColorRecovery ??
                config.background.edgeColorRecovery.default;
            }, false)
          }
          onValueCommit={onRecipeCommit}
        />
      </FieldLabel>
      <FieldLabel>
        Edge search: {refinement.edgeSearchRadius}px
        <UiSlider
          min={config.background.edgeSearchRadius.min}
          max={config.background.edgeSearchRadius.max}
          step={config.background.edgeSearchRadius.step}
          value={[refinement.edgeSearchRadius]}
          onValueChange={(value) =>
            onRecipeChange((draft) => {
              draft.background.edgeSearchRadius =
                value[0] ??
                draft.background.edgeSearchRadius ??
                config.background.edgeSearchRadius.default;
            }, false)
          }
          onValueCommit={onRecipeCommit}
        />
      </FieldLabel>
      <FieldLabel>
        Detection alpha: {recipe.detection.alphaThreshold}
        <UiSlider
          min={config.detection.alphaThreshold.min}
          max={config.detection.alphaThreshold.max}
          step={config.detection.alphaThreshold.step}
          value={[recipe.detection.alphaThreshold]}
          onValueChange={(value) =>
            onRecipeChange((draft) => {
              draft.detection.alphaThreshold =
                value[0] ?? draft.detection.alphaThreshold;
            }, false)
          }
          onValueCommit={onRecipeCommit}
        />
      </FieldLabel>
      <FieldLabel>
        Opening radius: {recipe.detection.openingRadius}px
        <UiSlider
          min={config.detection.openingRadius.min}
          max={config.detection.openingRadius.max}
          step={config.detection.openingRadius.step}
          value={[recipe.detection.openingRadius]}
          onValueChange={(value) =>
            onRecipeChange((draft) => {
              draft.detection.openingRadius =
                value[0] ?? draft.detection.openingRadius;
            }, false)
          }
          onValueCommit={onRecipeCommit}
        />
      </FieldLabel>
      <FieldLabel>
        Closing radius: {recipe.detection.closingRadius}px
        <UiSlider
          min={config.detection.closingRadius.min}
          max={config.detection.closingRadius.max}
          step={config.detection.closingRadius.step}
          value={[recipe.detection.closingRadius]}
          onValueChange={(value) =>
            onRecipeChange((draft) => {
              draft.detection.closingRadius =
                value[0] ?? draft.detection.closingRadius;
            }, false)
          }
          onValueCommit={onRecipeCommit}
        />
      </FieldLabel>
      <FieldLabel>
        Minimum island:{" "}
        {(recipe.detection.minimumRegionAreaRatio * 100).toFixed(
          config.detection.minimumRegionAreaRatio.digits - 2,
        )}
        %
        <UiSlider
          min={config.detection.minimumRegionAreaRatio.min}
          max={config.detection.minimumRegionAreaRatio.max}
          step={config.detection.minimumRegionAreaRatio.step}
          value={[recipe.detection.minimumRegionAreaRatio]}
          onValueChange={(value) =>
            onRecipeChange((draft) => {
              draft.detection.minimumRegionAreaRatio =
                value[0] ?? draft.detection.minimumRegionAreaRatio;
            }, false)
          }
          onValueCommit={onRecipeCommit}
        />
      </FieldLabel>
      {warnings.map((warning) => (
        <p
          key={warning}
          className="rounded bg-amber-500/10 p-2 text-xs text-amber-500"
        >
          {warning}
        </p>
      ))}
      <div className="space-y-2 border-t pt-3">
        <div className="text-xs font-medium">Touch-up tools</div>
        <div className="grid grid-cols-2 gap-2">
          <UiButton
            size="sm"
            variant={tool === "select" ? "default" : "outline"}
            onClick={() => onToolChange("select")}
          >
            <MousePointer2 className="mr-1 h-4 w-4" />
            Select
          </UiButton>
          <UiButton
            size="sm"
            variant={tool === "foreground" ? "default" : "outline"}
            onClick={() => onToolChange("foreground")}
          >
            <Paintbrush className="mr-1 h-4 w-4" />
            Keep
          </UiButton>
          <UiButton
            size="sm"
            variant={tool === "background" ? "default" : "outline"}
            onClick={() => onToolChange("background")}
          >
            <Eraser className="mr-1 h-4 w-4" />
            Erase
          </UiButton>
          <UiButton
            size="sm"
            variant={tool === "split" ? "default" : "outline"}
            onClick={() => onToolChange("split")}
          >
            <Scissors className="mr-1 h-4 w-4" />
            Split
          </UiButton>
          <UiButton
            size="sm"
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
          variant="outline"
          onClick={onClearEnclosedAreas}
        >
          Clear manual areas
          {enclosedChromaSeedCount > 0 ? ` (${enclosedChromaSeedCount})` : ""}
        </UiButton>
        <FieldLabel>
          Brush radius: {(brushRadius * 100).toFixed(1)}%
          <UiSlider
            min={config.strokes.editorRadius.min}
            max={config.strokes.editorRadius.max}
            step={config.strokes.editorRadius.step}
            value={[brushRadius]}
            onValueChange={(value) =>
              onBrushRadiusChange(value[0] ?? brushRadius)
            }
          />
        </FieldLabel>
        <p className="text-xs text-muted-foreground">
          Keep and Erase paint the transparent mask. Split cuts a region in two
          so it can be assigned to different parts; the exported image alpha
          stays continuous.
        </p>
      </div>
    </aside>
  );
}
