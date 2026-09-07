import { produce } from "immer";

import { uid } from "@/lib/uid";

import type {
  ProjectActions,
  ProjectStore,
  ProjectStoreSet,
} from "./projectStoreTypes.types.js";

type ProjectBlendShapeCommands = Pick<
  ProjectActions,
  | "createBlendShape"
  | "deleteBlendShape"
  | "setBlendShapeValue"
  | "updateBlendShapeDeltas"
>;

export function createProjectBlendShapeCommands(
  set: ProjectStoreSet,
): ProjectBlendShapeCommands {
  return {
    createBlendShape: (nodeId, name) =>
      set(
        produce<ProjectStore>((state) => {
          state.hasUnsavedChanges = true;
          const node = state.project.nodes.find((n) => n.id === nodeId);
          if (node?.type !== "part" || !node.mesh) return;
          const id = uid();
          const deltas = node.mesh.vertices.map(() => ({ dx: 0, dy: 0 }));
          if (!node.blendShapes) node.blendShapes = [];
          if (!node.blendShapeValues) node.blendShapeValues = {};
          node.blendShapes.push({ id, name: name ?? "Key", deltas });
          node.blendShapeValues[id] = 0;
          state.versionControl.geometryVersion++;
        }),
      ),

    deleteBlendShape: (nodeId, shapeId) =>
      set(
        produce<ProjectStore>((state) => {
          state.hasUnsavedChanges = true;
          const node = state.project.nodes.find((n) => n.id === nodeId);
          if (node?.type !== "part") return;
          if (node.blendShapes) {
            node.blendShapes = node.blendShapes.filter((s) => s.id !== shapeId);
          }
          if (node.blendShapeValues) {
            delete node.blendShapeValues[shapeId];
          }
          for (const mod of state.project.animationModifiers ?? []) {
            if (!mod.enabled) continue;
            for (const output of mod.outputs ?? []) {
              if (
                output.kind === "blendShapeValue" &&
                output.property === shapeId &&
                output.targetId === nodeId
              ) {
                mod.enabled = false;
              }
            }
          }
          state.versionControl.geometryVersion++;
        }),
      ),

    setBlendShapeValue: (nodeId, shapeId, value) =>
      set(
        produce<ProjectStore>((state) => {
          state.hasUnsavedChanges = true;
          const node = state.project.nodes.find((n) => n.id === nodeId);
          if (node?.type === "part" && node.blendShapeValues) {
            node.blendShapeValues[shapeId] = Math.max(0, Math.min(1, value));
            state.versionControl.geometryVersion++;
          }
        }),
      ),

    updateBlendShapeDeltas: (nodeId, shapeId, deltas) =>
      set(
        produce<ProjectStore>((state) => {
          state.hasUnsavedChanges = true;
          const node = state.project.nodes.find((n) => n.id === nodeId);
          if (node?.type !== "part") return;
          const shape = node.blendShapes?.find((s) => s.id === shapeId);
          if (shape) {
            shape.deltas = deltas;
            state.versionControl.geometryVersion++;
          }
        }),
      ),
  };
}
