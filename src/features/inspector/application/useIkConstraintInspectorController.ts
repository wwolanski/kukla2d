import { useCallback, useMemo } from "react";

import type { Bone, Constraint } from "@kukla2d/contracts";

import { useAnimationStore } from "@/store/animationStore";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";

import {
  inspectorClearPoseTarget,
  inspectorCommit,
  inspectorPosePreview,
  inspectorPreview,
} from "@/features/animation";
import { useWorkflowSelector } from "@/features/canvas";

import { isFiniteNumber } from "@/lib/math";

type NumericConstraintProperty =
  "targetX" | "targetY" | "mix" | "fkIk" | "order";
type PoseConstraintProperty = NumericConstraintProperty | "bendPositive";

interface IkConstraintInspectorController {
  assignedBone: Bone | undefined;
  editsPose: boolean;
  isAnimationMode: boolean;
  poseOverride: Record<string, unknown>;
  hasPoseOverride: boolean;
  referenceValues: Constraint | (Constraint & Record<string, unknown>);
  rename: (name: string) => void;
  setEnabled: (enabled: boolean) => void;
  previewConstraint: (
    property: PoseConstraintProperty,
    value: number | boolean,
  ) => void;
  commitConstraint: () => void;
  resetConstraintPose: () => void;
  authorValue: (
    property: PoseConstraintProperty,
    value: number | boolean,
  ) => void;
  effectiveValue: (
    property: NumericConstraintProperty,
    fallback: number,
  ) => number;
  toggleBendDirection: () => void;
  requestBoneReassignment: () => void;
  remove: () => void;
}

interface IkConstraintControllerOptions {
  constraint: Constraint;
  bones: readonly Bone[];
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function useIkConstraintInspectorController({
  constraint,
  bones,
}: IkConstraintControllerOptions): IkConstraintInspectorController {
  const updateProject = useProjectStore((state) => state.updateProject);
  const editorMode = useEditorStore((state) => state.editorMode);
  const activeToolValue: unknown = useWorkflowSelector(
    (state: { context: { activeTool: string } }) => state.context.activeTool,
  );
  const activeTool =
    typeof activeToolValue === "string" ? activeToolValue : "select";
  const defaultPose = useProjectStore((state) => state.project.defaultPose);
  const draftPose = useAnimationStore((state) => state.draftPose);
  const setInteraction = useEditorStore((state) => state.setInteraction);
  const setSelection = useEditorStore((state) => state.setSelection);
  const setActiveConstraintId = useEditorStore(
    (state) => state.setActiveConstraintId,
  );
  const assignedBone = bones.find(
    (bone) => bone.id === constraint.assignedBoneId,
  );
  const editsPose = editorMode === "animation" || activeTool === "pose";
  const isAnimationMode = editorMode === "animation";
  const poseOverride = useMemo<Record<string, unknown>>(
    () => ({
      ...(defaultPose[constraint.id] ?? {}),
      ...(draftPose.get(constraint.id) ?? {}),
    }),
    [constraint.id, defaultPose, draftPose],
  );
  const hasPoseOverride = Object.keys(poseOverride).length > 0;

  const rename = useCallback(
    (name: string) => {
      updateProject((project) => {
        const target = project.constraints.find(
          (item) => item.id === constraint.id,
        );
        if (target) target.name = name;
      });
    },
    [constraint.id, updateProject],
  );

  const setEnabled = useCallback(
    (enabled: boolean) => {
      updateProject((project) => {
        const target = project.constraints.find(
          (item) => item.id === constraint.id,
        );
        if (target) target.enabled = enabled;
      });
    },
    [constraint.id, updateProject],
  );

  const previewConstraint = useCallback(
    (property: PoseConstraintProperty, value: number | boolean) => {
      if (isAnimationMode) inspectorPreview(constraint.id, property, value);
    },
    [constraint.id, isAnimationMode],
  );

  const commitConstraint = useCallback(() => {
    if (isAnimationMode) inspectorCommit("gesture");
  }, [isAnimationMode]);

  const resetConstraintPose = useCallback(() => {
    updateProject((project) => {
      if (!project.defaultPose[constraint.id]) return;
      const next = { ...project.defaultPose };
      delete next[constraint.id];
      project.defaultPose = next;
    });
    inspectorClearPoseTarget(constraint.id);
  }, [constraint.id, updateProject]);

  const authorValue = useCallback(
    (property: PoseConstraintProperty, value: number | boolean) => {
      if (isAnimationMode) {
        previewConstraint(property, value);
        return;
      }
      if (activeTool === "pose") {
        inspectorPosePreview(constraint.id, property, value);
        return;
      }
      if (hasPoseOverride) return;
      inspectorClearPoseTarget(constraint.id);
      updateProject((project) => {
        const target = project.constraints.find(
          (candidate) => candidate.id === constraint.id,
        );
        if (!target) return;
        for (const key of [
          "targetX",
          "targetY",
          "mix",
          "fkIk",
          "order",
        ] as const) {
          const poseValue = poseOverride[key];
          if (isFiniteNumber(poseValue)) target[key] = poseValue;
        }
        if (isBoolean(poseOverride.bendPositive))
          target.bendPositive = poseOverride.bendPositive;
        if (property === "bendPositive") {
          if (typeof value === "boolean") target.bendPositive = value;
        } else if (typeof value === "number") {
          target[property] = value;
        }
        if (project.defaultPose[constraint.id]) {
          const next = { ...project.defaultPose };
          delete next[constraint.id];
          project.defaultPose = next;
        }
      });
    },
    [
      activeTool,
      constraint.id,
      hasPoseOverride,
      isAnimationMode,
      poseOverride,
      previewConstraint,
      updateProject,
    ],
  );

  const effectiveValue = useCallback(
    (property: NumericConstraintProperty, fallback: number): number => {
      if (editsPose) {
        const poseValue = poseOverride[property];
        if (isFiniteNumber(poseValue)) return poseValue;
      }
      const constraintValue = constraint[property];
      return typeof constraintValue === "number" ? constraintValue : fallback;
    },
    [constraint, editsPose, poseOverride],
  );

  const toggleBendDirection = useCallback(() => {
    const next = constraint.bendPositive === false;
    if (isAnimationMode) {
      previewConstraint("bendPositive", next);
      commitConstraint();
      return;
    }
    authorValue("bendPositive", next);
  }, [
    authorValue,
    commitConstraint,
    constraint.bendPositive,
    isAnimationMode,
    previewConstraint,
  ]);

  const requestBoneReassignment = useCallback(() => {
    setInteraction({ kind: "pendingPickIKBone", constraintId: constraint.id });
  }, [constraint.id, setInteraction]);

  const remove = useCallback(() => {
    updateProject((project) => {
      project.constraints = project.constraints.filter(
        (item) => item.id !== constraint.id,
      );
    });
    setSelection([]);
    setActiveConstraintId(null);
  }, [constraint.id, setActiveConstraintId, setSelection, updateProject]);

  const referenceValues = editsPose
    ? constraint
    : { ...constraint, ...poseOverride };

  return {
    assignedBone,
    editsPose,
    isAnimationMode,
    poseOverride,
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
  };
}
