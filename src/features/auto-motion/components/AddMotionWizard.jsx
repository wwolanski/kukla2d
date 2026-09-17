import { ArrowLeft, CheckCircle2, X, ChevronDown } from "lucide-react";

import { useEditorStore } from "@/store/editorStore.js";
import { useProjectStore } from "@/store/projectStore.js";

import {
  useAddMotionWizard,
  WIZARD_STEPS,
  IDLE_BREATHING_ID,
  HEAD_CHEEK_JIGGLE_ID,
} from "@/features/auto-motion/application/useAddMotionWizard.js";
import { MotionBindingRows } from "@/features/auto-motion/components/MotionBindingRows.jsx";

import { Button } from "@/components/ui/button.jsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.jsx";

export function AddMotionWizard({ open, onClose }) {
  const {
    stepIndex,
    selectedPresetId,
    bindings,
    jiggleSettings,
    cheekPick,
    canvasPickRole,
    error,
    isIdleBreathing,
    presetRoles,
    chestBound,
    hasValidMesh,
    sourceBoneSelected,
    faceBound,
    faceHasValidMesh,
    cheekPicked,
    canCreate,
    handleBindingChange,
    startCanvasPick,
    startCheekPick,
    cancelCanvasPick,
    handleNext,
    handleBack,
    handleClose,
    handleCreate,
    handlePresetSelect,
    updateJiggleSetting,
  } = useAddMotionWizard({ open, onClose });

  const nodes = useProjectStore((s) => s.project.nodes);
  const bones = useProjectStore((s) => s.project.bones ?? []);
  const selection = useEditorStore((s) => s.selection);
  const sourceBoneId = bindings?.sourceBone?.boneId ?? null;
  const faceBinding = bindings?.facePart;
  const faceNode = faceBound
    ? nodes.find((n) => n.id === faceBinding?.nodeId && n.type === "part")
    : null;
  const selectedPart =
    selection.length === 1
      ? nodes.find((n) => n.id === selection[0] && n.type === "part")
      : null;
  const chestNode = chestBound
    ? nodes.find((n) => n.id === bindings?.chest?.nodeId && n.type === "part")
    : null;

  if (!open) return null;

  const step = WIZARD_STEPS[stepIndex];
  const showBack = stepIndex > 0 && step !== "done";
  const showNext = step === "selectPreset" || step === "mapRoles";
  const showCreate = step === "prepareDeformation";
  const nextDisabled = step === "mapRoles" && !canCreate;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Add Motion
          </h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {step === "selectPreset" && "Choose a preset."}
            {step === "mapRoles" && "Map body parts to motion roles."}
            {step === "prepareDeformation" && "Review deformation readiness."}
            {step === "done" && "Motion created."}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleClose}
          title="Close"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b px-3 py-2 text-[10px] text-muted-foreground">
        {WIZARD_STEPS.slice(0, 3).map((item, index) => (
          <span
            key={item}
            className={
              index === stepIndex ? "font-semibold text-foreground" : ""
            }
          >
            {index + 1}
          </span>
        ))}
      </div>

      {error && (
        <div className="mx-3 mt-3 rounded border border-destructive/50 bg-destructive/10 px-3 py-2">
          <p className="text-[10px] text-destructive">{error}</p>
        </div>
      )}

      <div className="flex-1 px-3 py-3">
        {step === "selectPreset" && (
          <div className="space-y-3">
            <div
              className={`rounded border p-3 space-y-1 cursor-pointer transition-colors ${
                selectedPresetId === IDLE_BREATHING_ID
                  ? "border-primary bg-primary/5"
                  : "bg-muted/30 hover:bg-muted/50"
              }`}
              onClick={() => handlePresetSelect(IDLE_BREATHING_ID)}
            >
              <div className="flex items-center gap-2">
                {selectedPresetId === IDLE_BREATHING_ID && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
                <h4 className="text-sm font-semibold">Idle Breathing</h4>
              </div>
              <p className="text-[10px] leading-4 text-muted-foreground pl-5">
                Subtle breathing motion for idle animations. Creates a live
                modifier, a chest handle, and mesh deformation when the mapped
                part has a mesh.
              </p>
            </div>
            <div
              className={`rounded border p-3 space-y-1 cursor-pointer transition-colors ${
                selectedPresetId === HEAD_CHEEK_JIGGLE_ID
                  ? "border-primary bg-primary/5"
                  : "bg-muted/30 hover:bg-muted/50"
              }`}
              onClick={() => handlePresetSelect(HEAD_CHEEK_JIGGLE_ID)}
            >
              <div className="flex items-center gap-2">
                {selectedPresetId === HEAD_CHEEK_JIGGLE_ID && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
                <h4 className="text-sm font-semibold">Head Cheek Jiggle</h4>
              </div>
              <p className="text-[10px] leading-4 text-muted-foreground pl-5">
                Subtle cheek jiggle driven by head bone motion. Requires a head
                bone and a face part with mesh.
              </p>
            </div>
          </div>
        )}

        {step === "mapRoles" && (
          <div className="space-y-3">
            <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <p className="text-[10px] leading-4 text-amber-700 dark:text-amber-300">
                Use selected layer for the current selection, or click Select on
                canvas and pick a part in the viewport.
              </p>
            </div>
            {isIdleBreathing ? (
              <>
                <MotionBindingRows
                  presetRoles={presetRoles}
                  nodes={nodes}
                  selectedPart={selectedPart}
                  bindings={bindings}
                  pickingRole={canvasPickRole}
                  onChange={handleBindingChange}
                  onCanvasPick={startCanvasPick}
                  onCancelCanvasPick={cancelCanvasPick}
                  disabled={false}
                />
                {!chestBound && (
                  <p className="text-[10px] text-destructive">
                    Chest mapping is required before creating the motion.
                  </p>
                )}
                {chestBound && !hasValidMesh && (
                  <p className="text-[10px] text-destructive">
                    Chest part has no mesh. Idle Breathing requires a mesh with
                    at least 3 vertices.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="rounded border px-2 py-1.5 space-y-1">
                  <div className="flex items-center gap-1.5">
                    {sourceBoneSelected ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-xs font-medium capitalize">
                      Source Bone
                    </span>
                    <span className="text-[9px] text-muted-foreground bg-muted px-1 rounded">
                      Required
                    </span>
                  </div>
                  <div className="pl-5">
                    <Select
                      value={sourceBoneId ?? ""}
                      onValueChange={(val) => {
                        handleBindingChange("sourceBone", {
                          boneId: val,
                          skipped: false,
                        });
                      }}
                    >
                      <SelectTrigger className="h-6 text-xs">
                        <SelectValue placeholder="Select a bone" />
                      </SelectTrigger>
                      <SelectContent>
                        {bones.map((b) => (
                          <SelectItem
                            key={b.id}
                            value={b.id}
                            className="text-xs"
                          >
                            {b.name ?? b.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <MotionBindingRows
                  presetRoles={{ facePart: presetRoles?.facePart }}
                  nodes={nodes}
                  selectedPart={selectedPart}
                  bindings={bindings}
                  pickingRole={canvasPickRole}
                  onChange={handleBindingChange}
                  onCanvasPick={startCanvasPick}
                  onCancelCanvasPick={cancelCanvasPick}
                  disabled={false}
                />
                {faceBound && faceHasValidMesh && (
                  <div className="rounded border px-2 py-1.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium flex-1">
                        Cheek point
                      </span>
                      <Button
                        variant={cheekPicked ? "outline" : "default"}
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={startCheekPick}
                      >
                        {cheekPicked ? "Pick again" : "Pick on canvas"}
                      </Button>
                    </div>
                    {cheekPicked ? (
                      <div className="text-[10px] text-muted-foreground">
                        {nodes.find((n) => n.id === cheekPick.nodeId)?.name ??
                          "Face"}{" "}
                        · x {Math.round(cheekPick.localPoint.x)}, y{" "}
                        {Math.round(cheekPick.localPoint.y)}
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted-foreground">
                        Click the center of the cheek on the canvas.
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="w-14 shrink-0">Area</span>
                      <input
                        type="range"
                        min="0.12"
                        max="0.8"
                        step="0.01"
                        value={jiggleSettings.cheekRadius}
                        onChange={(event) =>
                          updateJiggleSetting(
                            "cheekRadius",
                            Number(event.target.value),
                          )
                        }
                        className="min-w-0 flex-1"
                      />
                      <span className="w-8 text-right font-mono tabular-nums">
                        {Math.round(jiggleSettings.cheekRadius * 100)}%
                      </span>
                    </label>
                  </div>
                )}
                {!sourceBoneSelected && (
                  <p className="text-[10px] text-destructive">
                    Source bone is required before creating the motion.
                  </p>
                )}
                {sourceBoneSelected && !faceBound && (
                  <p className="text-[10px] text-destructive">
                    Face part mapping is required before creating the motion.
                  </p>
                )}
                {sourceBoneSelected && faceBound && !faceHasValidMesh && (
                  <p className="text-[10px] text-destructive">
                    Face part has no mesh. Head Cheek Jiggle requires a mesh
                    with at least 3 vertices.
                  </p>
                )}
                {sourceBoneSelected &&
                  faceBound &&
                  faceHasValidMesh &&
                  !cheekPicked && (
                    <p className="text-[10px] text-destructive">
                      Cheek point is required. Click Pick on canvas, then click
                      the cheek area.
                    </p>
                  )}
              </>
            )}
          </div>
        )}

        {step === "prepareDeformation" && (
          <div className="space-y-3">
            {isIdleBreathing ? (
              chestNode ? (
                hasValidMesh ? (
                  <div className="rounded border bg-green-50 dark:bg-green-950/20 px-3 py-2 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      <span className="text-xs font-medium">Ready</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Chest part &quot;{chestNode.name}&quot; has{" "}
                      {chestNode.mesh.vertices.length} vertices. Mesh
                      deformation and blend shape will be generated.
                    </p>
                  </div>
                ) : (
                  <div className="rounded border bg-destructive/10 border-destructive/40 px-3 py-2 space-y-1">
                    <span className="text-xs font-medium text-destructive">
                      Mesh required
                    </span>
                    <p className="text-[10px] text-destructive/80">
                      Chest part &quot;{chestNode.name}&quot; has no mesh. Idle
                      Breathing requires a mesh with at least 3 vertices.
                    </p>
                  </div>
                )
              ) : (
                <div className="rounded border bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
                  <p className="text-[10px] text-amber-700 dark:text-amber-400">
                    Chest part not mapped. Go back and map the chest role.
                  </p>
                </div>
              )
            ) : (
              <>
                {!sourceBoneSelected && (
                  <div className="rounded border bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
                    <p className="text-[10px] text-amber-700 dark:text-amber-400">
                      Source bone not selected. Go back and select a head bone.
                    </p>
                  </div>
                )}
                {!faceNode && (
                  <div className="rounded border bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
                    <p className="text-[10px] text-amber-700 dark:text-amber-400">
                      Face part not mapped. Go back and map the face part.
                    </p>
                  </div>
                )}
                {faceNode && faceHasValidMesh && (
                  <div className="rounded border bg-green-50 dark:bg-green-950/20 px-3 py-2 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      <span className="text-xs font-medium">Ready</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Face part &quot;{faceNode.name}&quot; has{" "}
                      {faceNode.mesh.vertices.length} vertices. Bone-driven mesh
                      jiggle will be generated around the picked cheek point.
                    </p>
                  </div>
                )}
                {faceNode && !faceHasValidMesh && (
                  <div className="rounded border bg-destructive/10 border-destructive/40 px-3 py-2 space-y-1">
                    <span className="text-xs font-medium text-destructive">
                      Mesh required
                    </span>
                    <p className="text-[10px] text-destructive/80">
                      Face part &quot;{faceNode.name}&quot; has no mesh. Head
                      Cheek Jiggle requires a mesh with at least 3 vertices.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <p className="text-sm font-medium">
              {isIdleBreathing ? "Idle Breathing" : "Head Cheek Jiggle"} created
            </p>
            <p className="text-[10px] text-muted-foreground text-center">
              Adjust strength, speed, scope, or bake settings below.
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-1 border-t px-3 py-2">
        {showBack && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleBack}
          >
            <ArrowLeft className="mr-1 h-3 w-3" />
            Back
          </Button>
        )}
        {showNext && (
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleNext}
            disabled={nextDisabled}
          >
            Next
          </Button>
        )}
        {showCreate && (
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleCreate}
            disabled={!canCreate}
          >
            Create
          </Button>
        )}
        {step === "done" && (
          <Button size="sm" className="h-7 text-xs" onClick={handleClose}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
}
