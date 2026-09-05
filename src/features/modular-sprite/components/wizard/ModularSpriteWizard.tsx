import { Loader2 } from 'lucide-react';

import type { ModularSpriteId, ModularSpriteMaskStrokeKind } from '@kukla2d/contracts';

import { SchemaComparisonSidebar } from '@/features/modular-sprite-schema';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';

import { BackgroundStep } from './BackgroundStep.js';
import { PartDetailsStep } from './PartDetailsStep.js';
import { RegionGroupingStep } from './RegionGroupingStep.js';
import { ReviewStep } from './ReviewStep.js';
import { SourceStep } from './SourceStep.js';
import { WizardFooter } from './WizardFooter.js';
import { WizardHeader } from './WizardHeader.js';
import { useModularSpriteWizardController, type ModularSpriteWizardControllerPorts } from '../../application/useModularSpriteWizardController.js';
import { ModularSpritePreviewCanvas } from '../preview/ModularSpritePreviewCanvas.js';

import type { ModularSpriteCommitRequest } from '../../application/importContracts.js';

const UiButton = Button as React.ComponentType<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }>;
const UiDialog = Dialog as React.ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }>;
const UiDialogContent = DialogContent as React.ComponentType<{ className?: string; children: React.ReactNode }>;

export interface ModularSpriteWizardProps {
  open: boolean;
  existingId?: ModularSpriteId | null;
  onOpenChange: (open: boolean) => void;
  onCommit: (request: ModularSpriteCommitRequest) => Promise<unknown>;
  ports: ModularSpriteWizardControllerPorts;
  confirmDiscard?: () => boolean;
}

export function ModularSpriteWizard({ open, existingId, onOpenChange, onCommit, ports, confirmDiscard }: ModularSpriteWizardProps): React.ReactElement {
  const controller = useModularSpriteWizardController({ open, ...(existingId !== undefined ? { existingId } : {}), onOpenChange, onCommit, ports, ...(confirmDiscard ? { confirmDiscard } : {}) });
  const { state, ui } = controller;
  const result = state.processingResult;
  const source = state.source;
  const step = state.step;
  const existingName = source?.existingDocument?.name;
  const title = existingName ? `Edit ${existingName}` : 'Import 2D Modular Sprite';
  const onStroke = (kind: ModularSpriteMaskStrokeKind, points: { x: number; y: number }[]): void => controller.changeRecipe(recipe => { recipe.strokes.push({ kind, radius: ui.brushRadius, points }); }, 'discrete');

  return (
    <UiDialog open={open} onOpenChange={nextOpen => { if (!nextOpen) controller.requestClose(); }}>
      <UiDialogContent className="flex h-[95vh] w-[95vw] max-w-none flex-col gap-0 overflow-hidden p-0">
        <WizardHeader title={title} step={step} />
        <div className="relative min-h-0 flex-1 overflow-auto p-5">
          {step === 'source' && <SourceStep onFile={file => { void controller.loadFile(file); }} />}

          {(step === 'background' || step === 'regions') && source && result && <div className={`grid h-full min-h-[500px] gap-5 ${step === 'background' ? 'grid-cols-[280px_minmax(0,1fr)_300px]' : 'grid-cols-[280px_minmax(0,1fr)]'}`}>
            {step === 'background' && <BackgroundStep
              recipe={state.recipe}
              tool={ui.tool}
              brushRadius={ui.brushRadius}
              warnings={result.warnings}
              onRecipeChange={(change, process = true) => controller.changeRecipe(change, 'recipe', process)}
              onRecipeCommit={controller.commitRecipeProcessing}
              onToolChange={ui.setTool}
              onBrushRadiusChange={ui.setBrushRadius}
              onPickMode={() => { ui.setTool('eyedropper'); ui.setPreviewMode('original'); }}
            />}
            {step === 'regions' && <RegionGroupingStep
              result={result}
              grouping={state.grouping!}
              resultRef={controller.resultRef}
              resultVersion={controller.resultVersion}
              selectedRegionIds={ui.selectedRegionIds}
              assignmentPartKey={ui.assignmentPartKey}
              onToolSelect={() => ui.setTool('select')}
              onAssignmentPartKeyChange={controller.setAssignmentPartKey}
              onAssign={controller.assignSelected}
              onMerge={controller.mergeSelected}
              onExclude={controller.excludeSelected}
              onSelectRegion={controller.toggleRegionSelection}
              onUpdatePart={controller.updatePart}
            />}
            <section className="flex min-h-0 flex-col rounded-lg border bg-black/40">
              <div className="flex items-center gap-1 border-b bg-background p-2">
                {(['original', 'matte', 'result'] as const).map(mode => <UiButton key={mode} size="sm" variant={ui.previewMode === mode ? 'default' : 'ghost'} onClick={() => ui.setPreviewMode(mode)}>{mode}</UiButton>)}
                <span className="mx-1 h-5 w-px bg-border" />
                <label className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground"><input type="checkbox" checked={ui.showOverlays} onChange={event => ui.setShowOverlays(event.target.checked)} />Region outlines</label>
                <UiButton size="sm" variant="ghost" onClick={() => ui.setZoom(Math.max(0.25, ui.zoom - 0.25))}>−</UiButton>
                <span className="self-center text-xs text-muted-foreground">{Math.round(ui.zoom * 100)}%</span>
                <UiButton size="sm" variant="ghost" onClick={() => ui.setZoom(Math.min(4, ui.zoom + 0.25))}>+</UiButton>
                <span className="ml-auto self-center text-xs text-muted-foreground">{controller.busy ? `${state.progress.stage}… ${Math.round(state.progress.value * 100)}%` : `${result.regions.length} regions`}</span>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
                <ModularSpritePreviewCanvas source={source.preview} resultRef={controller.resultRef} resultVersion={controller.resultVersion} mode={ui.previewMode} tool={ui.tool} zoom={ui.zoom} selectedRegionIds={ui.selectedRegionIds} assignments={controller.assignments} showOverlays={ui.showOverlays} onSelectRegion={controller.toggleRegionSelection} onPickColor={color => { controller.changeRecipe(recipe => { recipe.background.mode = 'chroma'; recipe.background.color = color; }, 'discrete'); ui.setTool('select'); }} onStroke={onStroke} />
              </div>
            </section>
            {step === 'background' && <SchemaComparisonSidebar enabled={state.schema.autoMatch} onEnabledChange={controller.setAutoMatch} analyzing={state.schema.matching} progress={state.schema.progress} matches={state.schema.matches} schemas={state.schema.schemas} {...(state.schema.applied ? { appliedSchemaId: state.schema.applied.schema.schemaId } : {})} onApply={controller.applySchemaMatch} />}
          </div>}

          {step === 'parts' && state.grouping && <PartDetailsStep grouping={state.grouping} confirmedPartKeys={state.confirmation.confirmedPartKeys} resultRef={controller.resultRef} resultVersion={controller.resultVersion} advancedFrameKeys={ui.advancedFrameKeys} schema={{ addSchema: state.schema.addSchema, saveMode: state.schema.saveMode, metadata: state.schema.metadata, applied: Boolean(state.schema.applied) }} onUpdatePart={controller.updatePart} onUpdateFrame={controller.updateExtractionFrame} onRemovePart={controller.removePart} onToggleFrame={ui.toggleAdvancedFrame} onConfirmPart={controller.confirmPart} onSchemaEditorChange={controller.setSchemaEditor} />}

          {step === 'review' && <ReviewStep name={state.name} addToCanvas={state.addToCanvas} parts={state.grouping?.parts ?? []} {...(source?.file.type ? { sourceType: source.file.type } : {})} onNameChange={controller.setName} onAddToCanvasChange={controller.setAddToCanvas} />}

          {state.error && <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{state.error}</p>}
          {controller.busy && <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/70 backdrop-blur-[2px]"><Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden /><span className="text-sm font-medium">{state.progress.stage}…</span><span className="text-xs text-muted-foreground">{Math.round(state.progress.value * 100)}%</span></div>}
        </div>
        <WizardFooter step={step} busy={controller.busy} canGoNext={controller.canGoNext} onCancel={() => { controller.requestClose(); }} onBack={controller.back} onNext={controller.next} onFinalize={() => { void controller.finalize(); }} isExisting={Boolean(existingId)} />
      </UiDialogContent>
    </UiDialog>
  );
}
