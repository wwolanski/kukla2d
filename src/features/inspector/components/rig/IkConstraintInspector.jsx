import { Trash2 } from "lucide-react";

import { useIkConstraintInspectorController } from "@/features/inspector/application/useIkConstraintInspectorController.js";
import {
  SectionTitle,
  InspectorRow,
} from "@/features/inspector/components/fields/InspectorRow.jsx";
import { NumericInput } from "@/features/inspector/components/fields/NumericInput.jsx";
import { SliderRow } from "@/features/inspector/components/fields/SliderRow.jsx";

import { Button } from "@/components/ui/button.jsx";
import { Switch } from "@/components/ui/switch.jsx";

export function IkConstraintInspector({ constraint, bones }) {
  const {
    assignedBone,
    editsPose,
    isAnimationMode: isAnim,
    hasPoseOverride,
    referenceValues,
    rename,
    setEnabled,
    previewConstraint,
    commitConstraint,
    resetConstraintPose,
    authorValue,
    effectiveValue,
    toggleBendDirection,
    requestBoneReassignment,
    remove,
  } = useIkConstraintInspectorController({ constraint, bones });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle help="IK chain constraint. Assigns a target bone to follow a pole vector. Structural edits are staging-only.">
          IK Constraint
        </SectionTitle>
        <span
          className="rounded px-2 py-0.5 text-[10px] font-semibold"
          style={{
            color: `#${(constraint.color ?? 0x22d3ee).toString(16).padStart(6, "0")}`,
            backgroundColor: `#${(constraint.color ?? 0x22d3ee).toString(16).padStart(6, "0")}22`,
          }}
        >
          {constraint.name}
        </span>
      </div>
      <div className="border-l-2 border-primary pl-2">
        <p className="text-[10px] text-muted-foreground">
          Editing{" "}
          {isAnim ? "animation pose" : editsPose ? "pose preview" : "setup"}
          {" — "}
          {editsPose
            ? "setup unchanged"
            : "drag replaces pose; selection does not"}
        </p>
      </div>
      <InspectorRow label="Name">
        <input
          className="h-7 w-full max-w-[170px] rounded border border-border bg-input px-2 text-xs"
          value={constraint.name}
          disabled={isAnim}
          onChange={(event) => rename(event.target.value)}
        />
      </InspectorRow>
      <InspectorRow label="Enabled">
        <Switch
          checked={constraint.enabled !== false}
          disabled={editsPose}
          onCheckedChange={setEnabled}
          className="scale-75 origin-right"
        />
      </InspectorRow>
      <InspectorRow label="Assigned root">
        <span className="text-xs text-muted-foreground">
          {assignedBone?.name ?? "Unassigned"}
        </span>
      </InspectorRow>
      <InspectorRow label="Affected bones">
        <span className="text-xs tabular-nums">
          {constraint.affectedBoneIds?.length ?? 0}
        </span>
      </InspectorRow>
      <div className="grid grid-cols-2 gap-2">
        <InspectorRow label="X">
          <NumericInput
            value={effectiveValue("targetX", 0)}
            disabled={!editsPose && hasPoseOverride}
            onChange={(v) => authorValue("targetX", v)}
            onBlur={isAnim ? commitConstraint : undefined}
          />
        </InspectorRow>
        <InspectorRow label="Y">
          <NumericInput
            value={effectiveValue("targetY", 0)}
            disabled={!editsPose && hasPoseOverride}
            onChange={(v) => authorValue("targetY", v)}
            onBlur={isAnim ? commitConstraint : undefined}
          />
        </InspectorRow>
      </div>
      <SliderRow
        label="Mix"
        value={Math.round(effectiveValue("mix", 1) * 100)}
        min={0}
        max={100}
        disabled={!editsPose && hasPoseOverride}
        onChange={(v) => authorValue("mix", v / 100)}
        onDragStart={
          isAnim
            ? () => previewConstraint("mix", constraint.mix ?? 1)
            : undefined
        }
        onDragEnd={isAnim ? commitConstraint : undefined}
      />
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="tabular-nums">
          {editsPose ? "Setup" : "Pose"}: X{" "}
          {Number(referenceValues.targetX ?? 0).toFixed(1)}
          {" · "}Y {Number(referenceValues.targetY ?? 0).toFixed(1)}
          {" · "}Mix {Math.round((referenceValues.mix ?? 1) * 100)}%
        </span>
        {hasPoseOverride && (
          <button
            type="button"
            className="shrink-0 underline underline-offset-2 hover:text-foreground"
            onClick={resetConstraintPose}
          >
            Use setup
          </button>
        )}
      </div>
      <SliderRow
        label="FK / IK"
        value={Math.round(effectiveValue("fkIk", 1) * 100)}
        min={0}
        max={100}
        disabled={!editsPose && hasPoseOverride}
        onChange={(v) => authorValue("fkIk", v / 100)}
        onDragStart={
          isAnim
            ? () => previewConstraint("fkIk", constraint.fkIk ?? 1)
            : undefined
        }
        onDragEnd={isAnim ? commitConstraint : undefined}
      />
      <InspectorRow label="Bend direction">
        <button
          type="button"
          className="h-7 rounded border border-border px-2 text-xs hover:bg-muted"
          disabled={editsPose}
          onClick={toggleBendDirection}
        >
          {constraint.bendPositive === false ? "Negative" : "Positive"}
        </button>
      </InspectorRow>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-full text-[11px]"
        disabled={editsPose}
        onClick={requestBoneReassignment}
      >
        Reassign bone chain
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-full border-destructive/50 text-[11px] text-destructive hover:bg-destructive/10"
        disabled={editsPose}
        onClick={remove}
      >
        <Trash2 className="mr-1 h-3 w-3" /> Delete IK
      </Button>
    </div>
  );
}
