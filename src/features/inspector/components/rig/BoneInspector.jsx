import { Link2, Plus, Trash2 } from "lucide-react";

import {
  isAuthorableProperty,
  isPropertyAllowedForTargetKind,
} from "@/domain/animationProperties.js";
import { MAX_NAME_LENGTH } from "@/domain/nameConstraints.js";

import { useBoneInspectorController } from "@/features/inspector/application/useBoneInspectorController.js";
import {
  SectionTitle,
  InspectorRow,
} from "@/features/inspector/components/fields/InspectorRow.jsx";
import { NumericInput } from "@/features/inspector/components/fields/NumericInput.jsx";

import { Button } from "@/components/ui/button.jsx";
import { Label } from "@/components/ui/label.jsx";

export function BoneInspector({
  bone,
  bones,
  selectedPart,
  selectedLinkedBone,
}) {
  const {
    activeBone,
    riggingMode,
    editorMode,
    editsPose,
    poseOverride,
    hasPoseOverride,
    referencePose,
    isStructureBlocked,
    structureFeedback,
    invalidParentIds,
    setRiggingMode,
    renameBone,
    resetBonePose,
    updateBoneTransform,
    changeBoneParent,
    deleteBone,
    attachSelectedPart,
    createSlotSkinAttachment,
  } = useBoneInspectorController({
    bone,
    bones,
    selectedPart,
    selectedLinkedBone,
  });

  const modeButton = (mode, label, title) => (
    <Button
      type="button"
      variant={riggingMode === mode ? "default" : "outline"}
      size="sm"
      className="h-7 flex-1 text-[11px]"
      onClick={() => setRiggingMode(riggingMode === mode ? "off" : mode)}
      title={title}
    >
      {label}
    </Button>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SectionTitle help="Bone transform and hierarchy. Structural changes (create, delete, reparent) are staging-only.">
          Bone
        </SectionTitle>
      </div>

      <div className="flex gap-1">
        {modeButton("pose", "Pose", "Pose mode (P)")}
        {modeButton("bind", "Bind", "Bind mode (M)")}
      </div>

      {!activeBone ? (
        <p className="rounded border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
          Select a bone or create one from selected layer.
        </p>
      ) : (
        <div className="space-y-1.5">
          <InspectorRow label="Name">
            <input
              className="h-7 w-full max-w-[170px] rounded border border-border bg-input px-2 text-xs text-foreground"
              value={activeBone.name}
              maxLength={MAX_NAME_LENGTH}
              onChange={(e) => renameBone(activeBone.id, e.target.value)}
            />
          </InspectorRow>
          <div className="border-l-2 border-primary pl-2">
            <p className="text-[10px] text-muted-foreground">
              Editing{" "}
              {editorMode === "animation"
                ? "animation pose"
                : editsPose
                  ? "pose preview"
                  : "setup"}
              {" — "}
              {editsPose
                ? "setup unchanged"
                : "drag replaces pose; selection does not"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              ["x", "X", 0],
              ["y", "Y", 0],
              ["rotation", "Rot", 1],
              ["scaleX", "ScaleX", 2],
              ["scaleY", "ScaleY", 2],
              ["length", "Len", 0],
            ].map(([prop, label, precision]) => {
              const isAuthorable =
                isAuthorableProperty(prop) &&
                isPropertyAllowedForTargetKind(prop, "bone");
              const isDisabled = editorMode === "animation" && !isAuthorable;
              return (
                <div
                  key={prop}
                  className={`flex items-center justify-between gap-1 ${!editsPose && hasPoseOverride ? "pointer-events-none opacity-50" : ""}`}
                >
                  <Label className="text-xs text-muted-foreground">
                    {label}
                  </Label>
                  <NumericInput
                    value={
                      editsPose
                        ? (poseOverride[prop] ?? activeBone.setup?.[prop] ?? 0)
                        : (activeBone.setup?.[prop] ?? 0)
                    }
                    precision={precision}
                    disabled={isDisabled}
                    title={
                      isDisabled
                        ? "Setup-only property. Edit in Staging mode."
                        : undefined
                    }
                    onChange={(v) => updateBoneTransform(prop, v)}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span className="tabular-nums">
              {editsPose ? "Setup" : "Pose"}: X{" "}
              {Number(referencePose.x ?? 0).toFixed(0)}
              {" · "}Y {Number(referencePose.y ?? 0).toFixed(0)}
              {" · "}Rot {Number(referencePose.rotation ?? 0).toFixed(1)}°
              {editsPose
                ? ` · L ${Number(activeBone.setup?.length ?? 80).toFixed(0)}`
                : ""}
              {editsPose && (activeBone.setup?.scaleX ?? 1) !== 1
                ? ` · SX ${Number(activeBone.setup?.scaleX ?? 1).toFixed(2)}`
                : ""}
              {editsPose && (activeBone.setup?.scaleY ?? 1) !== 1
                ? ` · SY ${Number(activeBone.setup?.scaleY ?? 1).toFixed(2)}`
                : ""}
            </span>
            {hasPoseOverride && (
              <button
                type="button"
                className="shrink-0 underline underline-offset-2 hover:text-foreground"
                onClick={() => resetBonePose(activeBone.id)}
              >
                Use setup
              </button>
            )}
          </div>
          <InspectorRow label="Parent">
            <select
              className="h-7 w-full max-w-[170px] rounded border border-border bg-input px-2 text-xs text-foreground"
              value={activeBone.parentId ?? ""}
              disabled={isStructureBlocked}
              title={isStructureBlocked ? structureFeedback.tooltip : undefined}
              onChange={(e) =>
                changeBoneParent(activeBone.id, e.target.value || null)
              }
            >
              <option value="">None / root</option>
              {bones
                .filter(
                  (b) => b.id !== activeBone.id && !invalidParentIds.has(b.id),
                )
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </InspectorRow>
          <div className="grid grid-cols-2 gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              disabled={!selectedPart || isStructureBlocked}
              title={isStructureBlocked ? structureFeedback.tooltip : undefined}
              onClick={attachSelectedPart}
            >
              <Link2 className="mr-1 h-3 w-3" /> Bind
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              disabled={!selectedPart || isStructureBlocked}
              title={isStructureBlocked ? structureFeedback.tooltip : undefined}
              onClick={createSlotSkinAttachment}
            >
              <Plus className="mr-1 h-3 w-3" /> Slot
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-full border-destructive/50 text-[11px] text-destructive hover:bg-destructive/10"
            disabled={isStructureBlocked}
            title={isStructureBlocked ? structureFeedback.tooltip : undefined}
            onClick={() => deleteBone(activeBone.id)}
          >
            <Trash2 className="mr-1 h-3 w-3" /> Delete bone
          </Button>
        </div>
      )}
    </div>
  );
}
