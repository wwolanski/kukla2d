import { useCallback, useMemo } from "react";

import type { PartNode } from "@kukla2d/contracts";
import type { Bone, BoneId, VertexInfluence } from "@kukla2d/contracts";

import { useEditorStore } from "@/store/editorStore";
import type { EditorStore } from "@/store/editorStoreTypes.types.js";
import { useProjectStore } from "@/store/projectStore";

import { computeWorldMatrices } from "@/domain/transforms";

import { analyzeMeshTopologyImpact } from "@/features/canvas";
import { getBoneSegment } from "@/features/canvas";
import {
  bindUnweightedVerticesToBone,
  unbindMeshFromBone,
  applyAutoMeshWeights,
  computeMeshWeightStats,
} from "@/features/canvas";
import {
  getNodeMeshInfluenceBoneIds,
  setNodeMeshInfluenceBone,
} from "@/features/rigging";

type MeshOptions = EditorStore["meshDefaults"];
type MeshOptionKey = keyof MeshOptions;

interface MeshInspectorControllerOptions {
  node: PartNode;
}

function isMeshOptions(value: unknown): value is MeshOptions {
  if (!value || typeof value !== "object") return false;
  const options = value as Record<string, unknown>;
  return (
    typeof options.alphaThreshold === "number" &&
    typeof options.smoothPasses === "number" &&
    typeof options.gridSpacing === "number" &&
    typeof options.edgePadding === "number" &&
    typeof options.numEdgePoints === "number"
  );
}

function useMeshInspectorControllerImpl({
  node,
}: MeshInspectorControllerOptions) {
  const meshDefaults = useEditorStore((state) => state.meshDefaults);
  const setMeshDefaults = useEditorStore((state) => state.setMeshDefaults);
  const updateProject = useProjectStore((state) => state.updateProject);
  const nodes = useProjectStore((state) => state.project.nodes);
  const perPartOptions = isMeshOptions(node.meshOpts) ? node.meshOpts : null;
  const options = perPartOptions ?? meshDefaults;

  const remeshImpact = useMemo(() => {
    if (!node.mesh) return null;
    return analyzeMeshTopologyImpact(
      useProjectStore.getState().project,
      node.id,
      node.mesh.vertices.length,
    );
  }, [node.id, node.mesh]);

  const isDestructiveRemesh = Boolean(
    remeshImpact &&
    (remeshImpact.blendShapeIds.length > 0 ||
      remeshImpact.meshTrackAddresses.length > 0 ||
      remeshImpact.hasWeights),
  );

  const showRigWarning = useMemo(() => {
    if (!node.mesh || node.mesh.jointBoneId) return false;
    const parentNode = nodes.find((candidate) => candidate.id === node.parent);
    return Boolean(
      parentNode?.type === "group" &&
      (parentNode.boneRole === "leftArm" ||
        parentNode.boneRole === "rightArm" ||
        parentNode.boneRole === "leftLeg" ||
        parentNode.boneRole === "rightLeg"),
    );
  }, [node.mesh, node.parent, nodes]);

  const setOption = useCallback(
    (key: MeshOptionKey, value: number) => {
      if (perPartOptions) {
        updateProject((project) => {
          const target = project.nodes.find(
            (candidate) => candidate.id === node.id,
          );
          if (target?.type !== "part") return;
          const current = isMeshOptions(target.meshOpts)
            ? target.meshOpts
            : meshDefaults;
          target.meshOpts = { ...current, [key]: value };
        });
        return;
      }
      setMeshDefaults({ [key]: value });
    },
    [meshDefaults, node.id, perPartOptions, setMeshDefaults, updateProject],
  );

  const enablePerPartOptions = useCallback(() => {
    updateProject((project) => {
      const target = project.nodes.find(
        (candidate) => candidate.id === node.id,
      );
      if (target?.type === "part") target.meshOpts = { ...meshDefaults };
    });
  }, [meshDefaults, node.id, updateProject]);

  return {
    options,
    hasPerPartOptions: perPartOptions !== null,
    remeshImpact,
    isDestructiveRemesh,
    showRigWarning,
    setOption,
    enablePerPartOptions,
  };
}

export const useMeshInspectorController = (
  ...args: Parameters<typeof useMeshInspectorControllerImpl>
): ReturnType<typeof useMeshInspectorControllerImpl> =>
  useMeshInspectorControllerImpl(...args);

function getBoundBoneIds(
  influences: readonly (readonly VertexInfluence[])[] | null | undefined,
): Set<BoneId> {
  const ids = new Set<BoneId>();
  for (const list of influences ?? []) {
    for (const influence of list) {
      if (influence.weight > 0) ids.add(influence.boneId);
    }
  }
  return ids;
}

function transformPoint(
  matrix: ArrayLike<number> | undefined,
  x: number,
  y: number,
) {
  if (!matrix) return { x, y };
  return {
    x: (matrix[0] ?? 1) * x + (matrix[3] ?? 0) * y + (matrix[6] ?? 0),
    y: (matrix[1] ?? 0) * x + (matrix[4] ?? 1) * y + (matrix[7] ?? 0),
  };
}

function useMeshWeightsControllerImpl(inspectedNode: PartNode) {
  const updateProject = useProjectStore((state) => state.updateProject);
  const project = useProjectStore((state) => state.project);
  const activeBoneId = useEditorStore((state) => state.activeBoneId);
  const weightPaintBoneId = useEditorStore((state) => state.weightPaintBoneId);
  const setWeightPaintBoneId = useEditorStore(
    (state) => state.setWeightPaintBoneId,
  );
  const setInteraction = useEditorStore((state) => state.setInteraction);
  const bones = project.bones;
  const nodes = project.nodes;
  const node = useMemo(() => {
    const current = nodes.find(
      (candidate) => candidate.id === inspectedNode.id,
    );
    return current?.type === "part" ? current : inspectedNode;
  }, [inspectedNode, nodes]);
  const boneMap = useMemo(
    () => new Map<BoneId, Bone>(bones.map((bone) => [bone.id, bone])),
    [bones],
  );
  const boundBoneIds = useMemo(
    () =>
      new Set(
        [...getBoundBoneIds(node.mesh?.influences)].filter((id) =>
          boneMap.has(id),
        ),
      ),
    [boneMap, node.mesh?.influences],
  );
  const autoWeightBoneIds = useMemo(
    () =>
      new Set(
        getNodeMeshInfluenceBoneIds(node)
          .map((id) => bones.find((bone) => bone.id === id)?.id)
          .filter((id): id is BoneId => id !== undefined),
      ),
    [bones, node],
  );
  const nodeWorldMatrix = useMemo(
    () => computeWorldMatrices(nodes).get(node.id),
    [node.id, nodes],
  );
  const assignedBoneId = useMemo(() => {
    if (node.boneId && boneMap.has(node.boneId)) return node.boneId;
    const owner = bones.find(
      (bone) =>
        bone.nodeId === node.id ||
        node.mesh?.jointBoneId === bone.id ||
        node.mesh?.jointBoneId === bone.nodeId,
    );
    return owner?.id ?? null;
  }, [boneMap, bones, node]);
  const selectedBoneId = useMemo(() => {
    const paintedBone = weightPaintBoneId
      ? bones.find((bone) => bone.id === weightPaintBoneId)
      : null;
    if (paintedBone) return paintedBone.id;
    if (assignedBoneId) return assignedBoneId;
    const activeBone = activeBoneId
      ? bones.find((bone) => bone.id === activeBoneId)
      : null;
    return activeBone?.id ?? bones[0]?.id ?? null;
  }, [activeBoneId, assignedBoneId, bones, weightPaintBoneId]);
  const hasWeightPaintTargets = Boolean(
    node.mesh?.vertices.length && bones.length > 0 && selectedBoneId,
  );
  const stats = useMemo(
    () =>
      node.mesh ? computeMeshWeightStats(node.mesh, selectedBoneId) : null,
    [node.mesh, selectedBoneId],
  );

  const selectBone = useCallback(
    (boneId: string) => {
      const bone = bones.find((candidate) => candidate.id === boneId);
      setWeightPaintBoneId(bone?.id ?? null);
    },
    [bones, setWeightPaintBoneId],
  );

  const toggleAutoWeightBone = useCallback(
    (boneId: string, included: boolean) => {
      updateProject((currentProject) => {
        const targetNode = currentProject.nodes.find(
          (candidate) => candidate.id === node.id,
        );
        const bone = currentProject.bones.find(
          (candidate) => candidate.id === boneId,
        );
        if (targetNode?.type === "part" && bone) {
          setNodeMeshInfluenceBone(targetNode, bone.id, included);
        }
      });
    },
    [node.id, updateProject],
  );

  const bindSelectedBone = useCallback(() => {
    if (!selectedBoneId || !node.mesh?.vertices.length) return;
    updateProject((currentProject) => {
      const targetNode = currentProject.nodes.find(
        (candidate) => candidate.id === node.id,
      );
      if (targetNode?.type !== "part" || !targetNode.mesh?.vertices.length)
        return;
      setNodeMeshInfluenceBone(targetNode, selectedBoneId, true);
      bindUnweightedVerticesToBone(targetNode.mesh, selectedBoneId);
    });
  }, [node.id, node.mesh?.vertices.length, selectedBoneId, updateProject]);

  const unbindSelectedBone = useCallback(() => {
    if (!selectedBoneId || !node.mesh?.influences?.length) return;
    updateProject((currentProject) => {
      const targetNode = currentProject.nodes.find(
        (candidate) => candidate.id === node.id,
      );
      if (targetNode?.type !== "part" || !targetNode.mesh?.influences) return;
      unbindMeshFromBone(targetNode.mesh, selectedBoneId);
      setNodeMeshInfluenceBone(targetNode, selectedBoneId, false);
    });
    if (weightPaintBoneId === selectedBoneId) {
      const remaining = [...getBoundBoneIds(node.mesh.influences)].filter(
        (id) => id !== selectedBoneId && boneMap.has(id),
      );
      const activeBone = activeBoneId
        ? bones.find((bone) => bone.id === activeBoneId)
        : null;
      setWeightPaintBoneId(remaining[0] ?? activeBone?.id ?? null);
    }
  }, [
    activeBoneId,
    boneMap,
    bones,
    node.id,
    node.mesh,
    selectedBoneId,
    setWeightPaintBoneId,
    updateProject,
    weightPaintBoneId,
  ]);

  const applyAutomaticWeights = useCallback(() => {
    const boneIds = [...autoWeightBoneIds];
    if (!node.mesh?.vertices.length) return;
    if (boneIds.length === 0) {
      setInteraction({
        kind: "canvasNotice",
        message: "Auto Weights needs at least one checked influence bone.",
      });
      return;
    }
    let failureReason: "no-mesh" | "no-bones" | "no-segments" | null = null;
    updateProject((currentProject) => {
      const targetNode = currentProject.nodes.find(
        (candidate) => candidate.id === node.id,
      );
      if (targetNode?.type !== "part" || !targetNode.mesh?.vertices.length)
        return;
      const result = applyAutoMeshWeights({
        mesh: targetNode.mesh,
        boneIds,
        getBoneSegment: (id) => {
          const bone = boneMap.get(id);
          return bone ? getBoneSegment(bone, boneMap) : null;
        },
        vertexToWorld: (x, y) => transformPoint(nodeWorldMatrix, x, y),
      });
      if (!result.changed) failureReason = result.reason;
    });
    if (failureReason) {
      setInteraction({
        kind: "canvasNotice",
        message:
          failureReason === "no-segments"
            ? "Auto weights failed: selected bones have no valid setup segment."
            : "Auto Weights needs at least one checked influence bone.",
      });
    }
  }, [
    autoWeightBoneIds,
    boneMap,
    node.id,
    node.mesh?.vertices.length,
    nodeWorldMatrix,
    setInteraction,
    updateProject,
  ]);

  return {
    node,
    bones,
    boneMap,
    boundBoneIds,
    autoWeightBoneIds,
    selectedBoneId,
    hasWeightPaintTargets,
    stats,
    selectBone,
    toggleAutoWeightBone,
    bindSelectedBone,
    unbindSelectedBone,
    applyAutomaticWeights,
  };
}

export const useMeshWeightsController = (
  ...args: Parameters<typeof useMeshWeightsControllerImpl>
): ReturnType<typeof useMeshWeightsControllerImpl> =>
  useMeshWeightsControllerImpl(...args);
