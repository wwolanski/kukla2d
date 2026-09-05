import { Eraser, MousePointer2, Paintbrush, Scissors } from 'lucide-react';

import type { ModularSpriteProcessingRecipe } from '@kukla2d/contracts';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

import { FieldLabel } from './FieldLabel.js';

import type { EditorTool } from '../preview/ModularSpritePreviewCanvas.js';

const UiButton = Button as React.ComponentType<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }>;
const UiSlider = Slider as React.ComponentType<{ min?: number; max?: number; step?: number; value: number[]; onValueChange: (value: number[]) => void; onValueCommit?: (value: number[]) => void }>;

function colorToHex(color: { r: number; g: number; b: number }): string {
  return `#${[color.r, color.g, color.b].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function hexToColor(value: string): { r: number; g: number; b: number } {
  return { r: Number.parseInt(value.slice(1, 3), 16), g: Number.parseInt(value.slice(3, 5), 16), b: Number.parseInt(value.slice(5, 7), 16) };
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
}: {
  recipe: ModularSpriteProcessingRecipe;
  tool: EditorTool;
  brushRadius: number;
  warnings: readonly string[];
  onRecipeChange: (change: (recipe: ModularSpriteProcessingRecipe) => void, process?: boolean) => void;
  onRecipeCommit: () => void;
  onToolChange: (tool: EditorTool) => void;
  onBrushRadiusChange: (value: number) => void;
  onPickMode: () => void;
}): React.ReactElement {
  return (
    <aside className="space-y-4 overflow-auto rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">The keyer removes the background color (or uses existing alpha) and finds connected regions. Use the touch-up tools below to fix the mask.</p>
      <FieldLabel>Mode<select className="h-9 rounded-md border bg-background px-2" value={recipe.background.mode} onChange={event => onRecipeChange(draft => { draft.background.mode = event.target.value as 'alpha' | 'chroma'; })}><option value="alpha">Existing alpha</option><option value="chroma">Chroma key</option></select></FieldLabel>
      <FieldLabel>Background color<input className="h-9 w-full" type="color" value={colorToHex(recipe.background.color)} onChange={event => onRecipeChange(draft => { draft.background.color = hexToColor(event.target.value); })} /></FieldLabel>
      <UiButton size="sm" variant={tool === 'eyedropper' ? 'default' : 'outline'} onClick={onPickMode}>Pick from image</UiButton>
      <FieldLabel>Tolerance: {recipe.background.tolerance.toFixed(3)}<UiSlider min={0} max={0.25} step={0.002} value={[recipe.background.tolerance]} onValueChange={value => onRecipeChange(draft => { draft.background.tolerance = value[0] ?? draft.background.tolerance; }, false)} onValueCommit={onRecipeCommit} /></FieldLabel>
      <FieldLabel>Soft edge: {recipe.background.softness.toFixed(3)}<UiSlider min={0.002} max={0.25} step={0.002} value={[recipe.background.softness]} onValueChange={value => onRecipeChange(draft => { draft.background.softness = value[0] ?? draft.background.softness; }, false)} onValueCommit={onRecipeCommit} /></FieldLabel>
      <FieldLabel>Despill: {recipe.background.despill.toFixed(2)}<UiSlider min={0} max={1} step={0.02} value={[recipe.background.despill]} onValueChange={value => onRecipeChange(draft => { draft.background.despill = value[0] ?? draft.background.despill; }, false)} onValueCommit={onRecipeCommit} /></FieldLabel>
      <FieldLabel>Detection alpha: {recipe.detection.alphaThreshold}<UiSlider min={1} max={254} step={1} value={[recipe.detection.alphaThreshold]} onValueChange={value => onRecipeChange(draft => { draft.detection.alphaThreshold = value[0] ?? draft.detection.alphaThreshold; }, false)} onValueCommit={onRecipeCommit} /></FieldLabel>
      <FieldLabel>Opening radius: {recipe.detection.openingRadius}px<UiSlider min={0} max={8} step={1} value={[recipe.detection.openingRadius]} onValueChange={value => onRecipeChange(draft => { draft.detection.openingRadius = value[0] ?? draft.detection.openingRadius; }, false)} onValueCommit={onRecipeCommit} /></FieldLabel>
      <FieldLabel>Closing radius: {recipe.detection.closingRadius}px<UiSlider min={0} max={8} step={1} value={[recipe.detection.closingRadius]} onValueChange={value => onRecipeChange(draft => { draft.detection.closingRadius = value[0] ?? draft.detection.closingRadius; }, false)} onValueCommit={onRecipeCommit} /></FieldLabel>
      <FieldLabel>Minimum island: {(recipe.detection.minimumRegionAreaRatio * 100).toFixed(3)}%<UiSlider min={0} max={0.01} step={0.00005} value={[recipe.detection.minimumRegionAreaRatio]} onValueChange={value => onRecipeChange(draft => { draft.detection.minimumRegionAreaRatio = value[0] ?? draft.detection.minimumRegionAreaRatio; }, false)} onValueCommit={onRecipeCommit} /></FieldLabel>
      {warnings.map(warning => <p key={warning} className="rounded bg-amber-500/10 p-2 text-xs text-amber-500">{warning}</p>)}
      <div className="space-y-2 border-t pt-3">
        <div className="text-xs font-medium">Touch-up tools</div>
        <div className="grid grid-cols-2 gap-2">
          <UiButton size="sm" variant={tool === 'select' ? 'default' : 'outline'} onClick={() => onToolChange('select')}><MousePointer2 className="mr-1 h-4 w-4" />Select</UiButton>
          <UiButton size="sm" variant={tool === 'foreground' ? 'default' : 'outline'} onClick={() => onToolChange('foreground')}><Paintbrush className="mr-1 h-4 w-4" />Keep</UiButton>
          <UiButton size="sm" variant={tool === 'background' ? 'default' : 'outline'} onClick={() => onToolChange('background')}><Eraser className="mr-1 h-4 w-4" />Erase</UiButton>
          <UiButton size="sm" variant={tool === 'split' ? 'default' : 'outline'} onClick={() => onToolChange('split')}><Scissors className="mr-1 h-4 w-4" />Split</UiButton>
        </div>
        <FieldLabel>Brush radius: {(brushRadius * 100).toFixed(1)}%<UiSlider min={0.002} max={0.08} step={0.002} value={[brushRadius]} onValueChange={value => onBrushRadiusChange(value[0] ?? brushRadius)} /></FieldLabel>
        <p className="text-xs text-muted-foreground">Keep and Erase paint the transparent mask. Split cuts a region in two so it can be assigned to different parts; the exported image alpha stays continuous.</p>
      </div>
    </aside>
  );
}
