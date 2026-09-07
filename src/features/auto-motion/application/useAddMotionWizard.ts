import { useState, useEffect, useCallback } from "react";

import type { PartNode } from "@kukla2d/contracts";

import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";

import {
  getPresetRoles,
  getPresetDefaultParams,
} from "@/domain/autoMotion/presetRegistry.js";

import { clearPreviewModifierDraft } from "./previewModifierStore.js";

import type {
  Bindings,
  BindingValue,
  CheekPick,
  JiggleSettings,
  MotionPresetId,
  UseAddMotionWizardProps,
  UseAddMotionWizardResult,
} from "./useAddMotionWizard.types.js";

export const IDLE_BREATHING_ID = "builtin.idleBreathing";
export const HEAD_CHEEK_JIGGLE_ID = "builtin.headCheekJiggle";

export const WIZARD_STEPS = [
  "selectPreset",
  "mapRoles",
  "prepareDeformation",
  "done",
] as const;

export const JIGGLE_DEFAULTS = {
  cheekRadius: 0.35,
  strength: 0.7,
  gain: 0.8,
  deadZone: 0.1,
};

export function useAddMotionWizard({
  open,
  onClose,
}: UseAddMotionWizardProps): UseAddMotionWizardResult {
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedPresetId, setSelectedPresetId] =
    useState<MotionPresetId>(IDLE_BREATHING_ID);
  const [bindings, setBindings] = useState<Bindings>({});
  const [jiggleSettings, setJiggleSettings] =
    useState<JiggleSettings>(JIGGLE_DEFAULTS);
  const [cheekPick, setCheekPick] = useState<CheekPick | null>(null);
  const [canvasPickRole, setCanvasPickRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nodes = useProjectStore((s) => s.project.nodes);
  const bones = useProjectStore((s) => s.project.bones ?? []);
  const createIdleBreathingMotion = useProjectStore(
    (s) => s.createIdleBreathingMotion,
  );
  const createHeadCheekJiggleMotion = useProjectStore(
    (s) => s.createHeadCheekJiggleMotion,
  );
  const selection = useEditorStore((s) => s.selection);
  const interaction = useEditorStore((s) => s.interaction);
  const setInteraction = useEditorStore((s) => s.setInteraction);

  const selectedPart =
    selection.length === 1
      ? nodes.find((n) => n.id === selection[0] && n.type === "part")
      : null;

  const isIdleBreathing = selectedPresetId === IDLE_BREATHING_ID;
  const presetRoles = getPresetRoles(selectedPresetId);

  const chestBinding = bindings?.chest;
  const chestBound = Boolean(chestBinding?.nodeId && !chestBinding?.skipped);
  const chestNode = chestBound
    ? (nodes.find((n) => n.id === chestBinding!.nodeId && n.type === "part") as
        PartNode | undefined)
    : undefined;
  const hasValidMesh = Boolean(
    chestNode?.mesh?.vertices?.length && chestNode.mesh.vertices.length >= 3,
  );

  const sourceBoneId = bindings?.sourceBone?.boneId ?? null;
  const sourceBoneSelected = Boolean(
    sourceBoneId && bones.find((b) => b.id === sourceBoneId),
  );
  const faceBinding = bindings?.facePart;
  const faceBound = Boolean(faceBinding?.nodeId && !faceBinding?.skipped);
  const faceNode = faceBound
    ? (nodes.find((n) => n.id === faceBinding!.nodeId && n.type === "part") as
        PartNode | undefined)
    : undefined;
  const faceHasValidMesh = Boolean(
    faceNode?.mesh?.vertices?.length && faceNode.mesh.vertices.length >= 3,
  );
  const cheekPicked = Boolean(
    cheekPick?.nodeId &&
    cheekPick?.nodeId === faceBinding?.nodeId &&
    cheekPick?.localPoint,
  );

  const canCreateIdle = chestBound && hasValidMesh;
  const canCreateJiggle =
    sourceBoneSelected && faceBound && faceHasValidMesh && cheekPicked;
  const canCreate = isIdleBreathing ? canCreateIdle : canCreateJiggle;

  const handleBindingChange = useCallback(
    (roleKey: string, value: BindingValue) => {
      setBindings((prev) => ({ ...prev, [roleKey]: value }));
      if (roleKey === "facePart") {
        setCheekPick((prev) => (prev?.nodeId === value?.nodeId ? prev : null));
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setSelectedPresetId(IDLE_BREATHING_ID);
      setBindings({});
      setJiggleSettings(JIGGLE_DEFAULTS);
      setCheekPick(null);
      setCanvasPickRole(null);
      setError(null);
      clearPreviewModifierDraft();
    }
  }, [open]);

  useEffect(
    () => () => {
      const current = useEditorStore.getState().interaction;
      if (
        current?.kind === "pendingPickAutoMotionPart" ||
        current?.kind === "pendingPickAutoMotionPoint"
      ) {
        useEditorStore.getState().setInteraction({ kind: "idle" });
      }
      clearPreviewModifierDraft();
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    if (selectedPresetId !== HEAD_CHEEK_JIGGLE_ID) return;
    if (sourceBoneId) return;
    if (bones.length !== 1) return;
    const firstBone = bones[0];
    if (!firstBone) return;
    handleBindingChange("sourceBone", { boneId: firstBone.id, skipped: false });
  }, [bones, handleBindingChange, open, selectedPresetId, sourceBoneId]);

  useEffect(() => {
    if (!canvasPickRole) return;
    if (interaction?.kind !== "idle") return;
    if (!selectedPart) return;
    handleBindingChange(canvasPickRole, {
      nodeId: selectedPart.id,
      skipped: false,
    });
    setCanvasPickRole(null);
  }, [canvasPickRole, handleBindingChange, interaction?.kind, selectedPart]);

  useEffect(() => {
    if (interaction?.kind !== "autoMotionPickResult") return;
    if ((interaction as { role?: string }).role !== "cheekArea") return;
    handleBindingChange("facePart", {
      nodeId: (interaction as { nodeId: string }).nodeId,
      skipped: false,
    });
    setCheekPick({
      nodeId: (interaction as { nodeId: string }).nodeId,
      localPoint: (interaction as { localPoint: { x: number; y: number } })
        .localPoint,
      worldPoint: (interaction as { worldPoint: { x: number; y: number } })
        .worldPoint,
    });
    setCanvasPickRole(null);
    setInteraction({ kind: "idle" });
  }, [handleBindingChange, interaction, setInteraction]);

  const startCanvasPick = useCallback(
    (roleKey: string) => {
      setCanvasPickRole(roleKey);
      setInteraction({ kind: "pendingPickAutoMotionPart", role: roleKey });
    },
    [setInteraction],
  );

  const startCheekPick = useCallback(() => {
    setCanvasPickRole("cheekArea");
    setInteraction({
      kind: "pendingPickAutoMotionPoint",
      role: "cheekArea",
      targetNodeId: faceBinding?.nodeId ?? null,
    });
  }, [faceBinding?.nodeId, setInteraction]);

  const cancelCanvasPick = useCallback(() => {
    setCanvasPickRole(null);
    setInteraction({ kind: "idle" });
  }, [setInteraction]);

  const handleNext = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 2));
  }, []);

  const handleBack = useCallback(() => {
    if (canvasPickRole) cancelCanvasPick();
    setStepIndex((i) => Math.max(i - 1, 0));
  }, [canvasPickRole, cancelCanvasPick]);

  const handleClose = useCallback(() => {
    if (
      canvasPickRole ||
      interaction?.kind === "pendingPickAutoMotionPart" ||
      interaction?.kind === "pendingPickAutoMotionPoint"
    ) {
      cancelCanvasPick();
    }
    clearPreviewModifierDraft();
    onClose?.();
  }, [canvasPickRole, interaction?.kind, cancelCanvasPick, onClose]);

  const handleCreate = useCallback(() => {
    if (!canCreate) return;
    setError(null);

    if (isIdleBreathing) {
      const chestNodeId = bindings.chest?.nodeId;
      if (!chestNodeId) return;
      const params = {
        ...getPresetDefaultParams(IDLE_BREATHING_ID),
        strength: 1,
      };
      const result = createIdleBreathingMotion({
        chestNodeId,
        options: { ...params },
      });
      if (!result.changed) {
        setError(result.error ?? "Unable to create idle breathing motion.");
        return;
      }
    } else {
      const boneId = sourceBoneId;
      const faceNodeId = faceBinding?.nodeId;
      const point = cheekPick?.localPoint;
      if (!boneId || !faceNodeId || !point) return;

      const result = createHeadCheekJiggleMotion({
        sourceBoneId: boneId,
        faceNodeId,
        options: {
          strength: jiggleSettings.strength,
          gain: jiggleSettings.gain,
          deadZone: jiggleSettings.deadZone,
          cheekPoint: point,
          params: {
            cheekPointX: point.x,
            cheekPointY: point.y,
            cheekRadius: jiggleSettings.cheekRadius,
          },
        },
      });
      if (result.changed) {
        setCanvasPickRole(null);
        setInteraction({ kind: "idle" });
        setStepIndex(3);
        return;
      }
      setError(result.error ?? "Unable to create head cheek jiggle motion.");
    }
  }, [
    canCreate,
    isIdleBreathing,
    bindings,
    sourceBoneId,
    faceBinding,
    jiggleSettings,
    cheekPick,
    createIdleBreathingMotion,
    createHeadCheekJiggleMotion,
    setInteraction,
  ]);

  const handlePresetSelect = useCallback((presetId: MotionPresetId) => {
    setSelectedPresetId(presetId);
    setBindings({});
    setJiggleSettings(JIGGLE_DEFAULTS);
    setCheekPick(null);
  }, []);

  const updateJiggleSetting = useCallback(
    (key: keyof JiggleSettings, value: number) => {
      setJiggleSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  return {
    stepIndex,
    selectedPresetId,
    bindings,
    jiggleSettings,
    cheekPick,
    canvasPickRole,
    error,
    isIdleBreathing,
    presetRoles,
    chestBinding,
    chestBound,
    hasValidMesh,
    sourceBoneId,
    sourceBoneSelected,
    faceBinding,
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
  };
}
