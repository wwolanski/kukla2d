import { useCallback, useMemo } from "react";

import type { Node, PartNode, WarpDeformerNode } from "@kukla2d/contracts";

import { useAnimationStore } from "@/store/animationStore";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";

import { createAnimationAuthoringApi } from "@/features/animation";

type WarpPatch = Partial<
  Pick<WarpDeformerNode, "col" | "row" | "gridX" | "gridY" | "gridW" | "gridH">
>;

interface WarpDeformerController {
  editorMode: "staging" | "animation";
  activeAnimationId: string | null;
  update: (partial: WarpPatch) => void;
  fitToChildren: () => void;
  resetLattice: () => void;
  keyCurrentLattice: () => void;
}

interface Point {
  x: number;
  y: number;
}

function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return typeof point.x === "number" && typeof point.y === "number";
}

function collectDescendantMeshParts(
  nodes: readonly Node[],
  parentId: string,
): PartNode[] {
  const result: PartNode[] = [];
  for (const node of nodes) {
    if (node.parent !== parentId) continue;
    if (node.type === "part" && node.mesh) result.push(node);
    else if (node.type === "group" || node.type === "warpDeformer") {
      result.push(...collectDescendantMeshParts(nodes, node.id));
    }
  }
  return result;
}

export function useWarpDeformerController(
  node: WarpDeformerNode,
): WarpDeformerController {
  const nodes = useProjectStore((state) => state.project.nodes);
  const updateProject = useProjectStore((state) => state.updateProject);
  const activeAnimationId = useAnimationStore(
    (state) => state.activeAnimationId,
  );
  const draftPose = useAnimationStore((state) => state.draftPose);
  const clearDraftPoseForNode = useAnimationStore(
    (state) => state.clearDraftPoseForNode,
  );
  const editorMode = useEditorStore((state) => state.editorMode);
  const authoringApi = useMemo(() => createAnimationAuthoringApi(), []);

  const update = useCallback(
    (partial: WarpPatch) => {
      updateProject((project) => {
        const target = project.nodes.find(
          (candidate) => candidate.id === node.id,
        );
        if (target?.type === "warpDeformer") Object.assign(target, partial);
      });
    },
    [node.id, updateProject],
  );

  const fitToChildren = useCallback(() => {
    const children = collectDescendantMeshParts(nodes, node.id);
    if (children.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const child of children) {
      for (const vertex of child.mesh?.vertices ?? []) {
        const x = vertex.restX ?? vertex.x;
        const y = vertex.restY ?? vertex.y;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return;
    const padding = 20;
    const newGridX = minX - padding;
    const newGridY = minY - padding;
    const newGridW = maxX - minX + padding * 2;
    const newGridH = maxY - minY + padding * 2;

    updateProject((project) => {
      const target = project.nodes.find(
        (candidate) => candidate.id === node.id,
      );
      if (target?.type !== "warpDeformer") return;
      const oldGridX = target.gridX ?? 0;
      const oldGridY = target.gridY ?? 0;
      const oldGridW = target.gridW || 1;
      const oldGridH = target.gridH || 1;
      for (const animation of project.animations) {
        const track = animation.tracks.find(
          (candidate) =>
            candidate.targetId === target.id &&
            candidate.property === "mesh_verts",
        );
        if (!track) continue;
        for (const keyframe of track.keyframes) {
          if (!Array.isArray(keyframe.value) || !keyframe.value.every(isPoint))
            continue;
          keyframe.value = keyframe.value.map((point) => ({
            x: newGridX + ((point.x - oldGridX) / oldGridW) * newGridW,
            y: newGridY + ((point.y - oldGridY) / oldGridH) * newGridH,
          }));
        }
      }
      target.gridX = newGridX;
      target.gridY = newGridY;
      target.gridW = newGridW;
      target.gridH = newGridH;
    });
  }, [node.id, nodes, updateProject]);

  const resetLattice = useCallback(() => {
    updateProject((project) => {
      const defaultPose = project.defaultPose[node.id];
      if (defaultPose?.mesh_verts) delete defaultPose.mesh_verts;
      for (const animation of project.animations) {
        animation.tracks = animation.tracks.filter(
          (track) =>
            !(track.targetId === node.id && track.property === "mesh_verts"),
        );
      }
    });
    clearDraftPoseForNode(node.id);
  }, [clearDraftPoseForNode, node.id, updateProject]);

  const keyCurrentLattice = useCallback(() => {
    if (!activeAnimationId) return;
    const value = draftPose.get(node.id)?.mesh_verts;
    if (!Array.isArray(value) || value.length === 0 || !value.every(isPoint))
      return;
    authoringApi.preview({
      animationId: activeAnimationId,
      targetId: node.id,
      property: "mesh_verts",
      value: value.map((point) => ({ x: point.x, y: point.y })),
      timeMs: useAnimationStore.getState().currentTime,
      source: "inspector",
      phase: "preview",
    });
    authoringApi.commit({ source: "warp-key" });
  }, [activeAnimationId, authoringApi, draftPose, node.id]);

  return {
    editorMode,
    activeAnimationId,
    update,
    fitToChildren,
    resetLattice,
    keyCurrentLattice,
  };
}
