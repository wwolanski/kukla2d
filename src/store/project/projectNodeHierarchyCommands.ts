import { produce, produceWithPatches } from "immer";

import { toAssetId } from "@kukla2d/contracts";
import type { NodeId } from "@kukla2d/contracts";
import type { Node } from "@kukla2d/contracts";

import { pushPatches, transaction } from "@/store/undoHistory";

import {
  buildDeleteSelectionIntent,
  deleteBones,
  deleteConstraints,
  deletePartNodes,
} from "@/domain/deleteCommands.js";

import { uid } from "@/lib/uid";

import { deepClone, DEFAULT_TRANSFORM } from "./projectStoreShared.js";

import type {
  ProjectActions,
  ProjectStore,
  ProjectStoreGet,
  ProjectStoreSet,
} from "./projectStoreTypes.types.js";
import type { Draft } from "immer";

type ProjectNodeHierarchyCommands = Pick<
  ProjectActions,
  | "createWarpDeformer"
  | "createGroup"
  | "reparentNode"
  | "duplicateNode"
  | "deleteNode"
  | "deleteSelectedNodes"
  | "deleteSelectedBones"
  | "deleteSelectedConstraints"
  | "deleteSelection"
  | "buildDeleteSelectionIntent"
>;

export function createProjectNodeHierarchyCommands(
  set: ProjectStoreSet,
  get: ProjectStoreGet,
): ProjectNodeHierarchyCommands {
  return {
    createWarpDeformer: (name) =>
      set(
        produce<ProjectStore>((state) => {
          state.hasUnsavedChanges = true;
          state.project.nodes.push({
            id: uid() as NodeId,
            type: "warpDeformer",
            name: name ?? "Warp Deformer",
            parent: null,
            transform: DEFAULT_TRANSFORM(),
            visible: true,
            opacity: 1,
            col: 2,
            row: 2,
            gridX: 0,
            gridY: 0,
            gridW: 200,
            gridH: 200,
          });
          state.versionControl.transformVersion++;
        }),
      ),

    createGroup: (name) =>
      set(
        produce<ProjectStore>((state) => {
          state.hasUnsavedChanges = true;
          state.project.nodes.push({
            id: uid() as NodeId,
            type: "group",
            name: name ?? "Group",
            parent: null,
            transform: DEFAULT_TRANSFORM(),
            visible: true,
            opacity: 1,
          });
          state.versionControl.transformVersion++;
        }),
      ),

    reparentNode: (nodeId, newParentId) =>
      set(
        produce<ProjectStore>((state) => {
          state.hasUnsavedChanges = true;
          const node = state.project.nodes.find((n) => n.id === nodeId);
          if (node) node.parent = (newParentId as NodeId | undefined) ?? null;
          state.versionControl.transformVersion++;
        }),
      ),

    duplicateNode: (nodeId) =>
      set((state) => {
        const [nextState, patches, inversePatches] = produceWithPatches(
          state,
          (draft: Draft<ProjectStore>) => {
            draft.hasUnsavedChanges = true;
            const projectDraft = draft.project;
            const idsToMap = new Map<NodeId, NodeId>();

            function doDuplicate(
              id: NodeId,
              parentId: NodeId | null,
            ): NodeId | null {
              const original = projectDraft.nodes.find((n) => n.id === id);
              if (!original) return null;

              const newId = uid() as NodeId;
              idsToMap.set(id, newId);

              const newNode: Draft<Node> = deepClone(original);
              newNode.id = newId;
              newNode.parent = parentId;
              newNode.name = original.name + " Copy";

              if (original.type === "part") {
                const originalTex = projectDraft.textures.find(
                  (t) => String(t.id) === String(id),
                );
                if (originalTex) {
                  projectDraft.textures.push({
                    ...originalTex,
                    id: toAssetId(newId),
                  });
                }

                projectDraft.nodes.forEach((n) => {
                  if (n.type === "part" && n.draw_order > original.draw_order) {
                    n.draw_order++;
                  }
                });
                if (newNode.type === "part")
                  newNode.draw_order = original.draw_order + 1;
              }

              projectDraft.nodes.push(newNode);

              const children = projectDraft.nodes.filter(
                (n) => n.parent === id && !idsToMap.has(n.id),
              );
              for (const child of children) {
                doDuplicate(child.id, newId);
              }
              return newId;
            }

            const rootNode = projectDraft.nodes.find((n) => n.id === nodeId);
            if (!rootNode) return;

            doDuplicate(nodeId as NodeId, rootNode.parent);

            for (const [oldId, newId] of idsToMap) {
              for (const animation of projectDraft.animations) {
                const tracks = animation.tracks.filter(
                  (t) => t.targetId === oldId,
                );
                for (const track of tracks) {
                  animation.tracks.push({
                    ...deepClone(track),
                    targetId: newId,
                  });
                }
              }
            }

            draft.versionControl.transformVersion++;
            draft.versionControl.geometryVersion++;
          },
        );
        if (patches.length > 0) pushPatches(patches, inversePatches);
        return nextState;
      }),

    deleteNode: (nodeId) =>
      set((state) => {
        const [nextState, patches, inversePatches] = produceWithPatches(
          state,
          (draft: Draft<ProjectStore>) => {
            draft.hasUnsavedChanges = true;
            deletePartNodes(draft.project, [nodeId]);
          },
        );
        if (patches.length > 0) pushPatches(patches, inversePatches);
        return nextState;
      }),

    deleteSelectedNodes: (nodeIds) =>
      set((state) => {
        const [nextState, patches, inversePatches] = produceWithPatches(
          state,
          (draft: Draft<ProjectStore>) => {
            draft.hasUnsavedChanges = true;
            deletePartNodes(draft.project, nodeIds);
          },
        );
        if (patches.length > 0) pushPatches(patches, inversePatches);
        return nextState;
      }),

    deleteSelectedBones: (boneIds) =>
      set((state) => {
        const [nextState, patches, inversePatches] = produceWithPatches(
          state,
          (draft: Draft<ProjectStore>) => {
            draft.hasUnsavedChanges = true;
            deleteBones(draft.project, boneIds);
          },
        );
        if (patches.length > 0) pushPatches(patches, inversePatches);
        return nextState;
      }),

    deleteSelectedConstraints: (constraintIds) =>
      set((state) => {
        const [nextState, patches, inversePatches] = produceWithPatches(
          state,
          (draft: Draft<ProjectStore>) => {
            draft.hasUnsavedChanges = true;
            deleteConstraints(draft.project, constraintIds);
          },
        );
        if (patches.length > 0) pushPatches(patches, inversePatches);
        return nextState;
      }),

    deleteSelection: ({
      nodeIds = [],
      boneIds = [],
      constraintIds = [],
    } = {}) =>
      set((state) => {
        const [nextState, patches, inversePatches] = produceWithPatches(
          state,
          (draft: Draft<ProjectStore>) => {
            const nodeResult = deletePartNodes(draft.project, nodeIds);
            const boneResult = deleteBones(draft.project, boneIds);
            const constraintResult = deleteConstraints(
              draft.project,
              constraintIds,
            );
            if (
              nodeResult.changed ||
              boneResult.changed ||
              constraintResult.changed
            ) {
              draft.hasUnsavedChanges = true;
            }
          },
        );
        if (patches.length > 0) {
          transaction("Delete selection", "delete", () => {
            pushPatches(patches, inversePatches);
          });
        }
        return nextState;
      }),

    buildDeleteSelectionIntent: (selection) => {
      return buildDeleteSelectionIntent(get().project, selection);
    },
  };
}
