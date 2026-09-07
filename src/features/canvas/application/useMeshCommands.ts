import { useCallback } from "react";

import type { BoneId, PartNode, ProjectDocument } from "@kukla2d/contracts";

import { useEditorStore } from "@/store/editorStore";
import type { ProjectStore } from "@/store/project/projectStoreTypes.types.js";

import { applyLegacyJointWeights } from "@/features/canvas/domain/legacySkinning.js";
import type {
  MeshGenerationOptions,
  MeshGenerationResult,
} from "@/features/canvas/domain/mesh-generation/generate.types.js";
import { computeSmartMeshOpts } from "@/features/canvas/domain/meshEditing.js";
import {
  analyzeMeshTopologyImpact,
  applyMeshTopologyChange,
} from "@/features/canvas/domain/meshTopologyCommands.js";
import type { MeshTopologyImpact } from "@/features/canvas/domain/meshTopologyCommands.types.js";
import { bindMeshToBone } from "@/features/canvas/domain/meshWeighting.js";
import type { WorkflowEvent } from "@/features/canvas/domain/workflowContracts.types.js";

import type { CanvasSceneGateway } from "./canvasApplication.types.js";
import type { RefObject } from "react";

type MeshBindingResult =
  | { bound: true; boneId: BoneId }
  | { bound: false; reason: "no-mesh" | "missing-bone" | "unassigned" };

interface MeshWorkerClient {
  generate(
    partId: string,
    imageData: ImageData,
    opts?: MeshGenerationOptions,
  ): Promise<{
    vertices: MeshGenerationResult["vertices"];
    uvs: Float32Array;
    triangles: MeshGenerationResult["triangles"];
    edgeIndices: number[];
  }>;
}

interface MeshCommandDependencies {
  projectRef: RefObject<ProjectDocument>;
  updateProject?: ProjectStore["updateProject"];
  meshWorkerClient: MeshWorkerClient | null;
  sceneGatewayRef: RefObject<CanvasSceneGateway | null>;
  markDirty?: () => void;
  sendWorkflowEvent?: (event: WorkflowEvent) => void;
}

interface MeshCommands {
  dispatchMeshWorker: (
    partId: string,
    imageData: ImageData,
    options?: MeshGenerationOptions,
    enterEditMode?: boolean,
  ) => Promise<void>;
  remeshPart: (
    partId: string,
    options?: MeshGenerationOptions,
    switchTool?: boolean,
  ) => void;
  autoMeshAllParts: () => void;
  deleteMeshForPart: (partId: string) => void;
  getRemeshImpact: (partId: string) => MeshTopologyImpact | null;
}

function isPartNodeLike(value: unknown): value is PartNode {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === undefined || type === "part";
}

function showCanvasNotice(message: string): void {
  useEditorStore.getState().setInteraction?.({ kind: "canvasNotice", message });
}

function findMeshOwnerBoneId(
  project: ProjectDocument,
  node: PartNode,
): BoneId | null {
  const bones = project.bones ?? [];
  if (node?.boneId && bones.some((bone) => bone.id === node.boneId))
    return node.boneId;
  const owner = bones.find((bone) => bone.nodeId === node?.id);
  return owner?.id ?? null;
}

function bindMeshToOwnerBone(
  project: ProjectDocument,
  node: PartNode,
): MeshBindingResult {
  if (!node?.mesh?.vertices?.length) return { bound: false, reason: "no-mesh" };
  const ownerBoneId = findMeshOwnerBoneId(project, node);
  if (!ownerBoneId) {
    return {
      bound: false,
      reason: node?.boneId ? "missing-bone" : "unassigned",
    };
  }
  bindMeshToBone(node.mesh, ownerBoneId);
  node.mesh.jointBoneId = ownerBoneId;
  node.mesh.boneWeights = Array.from(
    { length: node.mesh.vertices.length },
    () => 1,
  );
  return { bound: true, boneId: ownerBoneId };
}

export function useMeshCommands({
  projectRef,
  updateProject,
  meshWorkerClient,
  sceneGatewayRef,
  markDirty,
  sendWorkflowEvent,
}: MeshCommandDependencies): MeshCommands {
  const getRemeshImpact = useCallback(
    (partId: string): MeshTopologyImpact | null => {
      const project = projectRef.current;
      const node = project.nodes.find((n) => n.id === partId);
      if (!isPartNodeLike(node) || !node.mesh) return null;
      const nextVertexCount = node.mesh.vertices?.length ?? 0;
      return analyzeMeshTopologyImpact(project, partId, nextVertexCount);
    },
    [projectRef],
  );

  const dispatchMeshWorker = useCallback(
    async (
      partId: string,
      imageData: ImageData,
      opts?: MeshGenerationOptions,
      enterEditMode = false,
    ): Promise<void> => {
      if (!meshWorkerClient) return;
      const { vertices, uvs, triangles, edgeIndices } =
        await meshWorkerClient.generate(partId, imageData, opts);
      const bindingOutcome: { current: MeshBindingResult | null } = {
        current: null,
      };
      if (updateProject) {
        updateProject((projectDraft) => {
          const node = projectDraft.nodes.find((n) => n.id === partId);
          if (!isPartNodeLike(node)) return;
          if (node.mesh) {
            applyMeshTopologyChange(projectDraft, partId, {
              type: "remesh",
              mesh: { vertices, uvs: Array.from(uvs), triangles, edgeIndices },
              ...(node.imageWidth === undefined
                ? {}
                : { imageWidth: node.imageWidth }),
              ...(node.imageHeight === undefined
                ? {}
                : { imageHeight: node.imageHeight }),
            });
          } else {
            node.mesh = {
              vertices,
              uvs: Array.from(uvs),
              triangles,
              edgeIndices,
            };
            if ((node.blendShapes?.length ?? 0) > 0) {
              node.blendShapes = [];
              node.blendShapeValues = {};
            }
          }
          bindingOutcome.current = bindMeshToOwnerBone(projectDraft, node);
          if (!bindingOutcome.current.bound && node.mesh) {
            applyLegacyJointWeights({
              project: projectDraft,
              node: { ...node, mesh: node.mesh },
              vertices,
            });
          }
          if (
            node.transform &&
            node.transform.pivotX === 0 &&
            node.transform.pivotY === 0
          ) {
            let minX = Infinity,
              minY = Infinity,
              maxX = -Infinity,
              maxY = -Infinity;
            for (const v of vertices) {
              if (v.x < minX) minX = v.x;
              if (v.x > maxX) maxX = v.x;
              if (v.y < minY) minY = v.y;
              if (v.y > maxY) maxY = v.y;
            }
            if (minX !== Infinity) {
              node.transform.pivotX = (minX + maxX) / 2;
              node.transform.pivotY = (minY + maxY) / 2;
            }
          }
        });
      }
      if (sceneGatewayRef?.current) {
        sceneGatewayRef.current.uploadMesh(partId, {
          vertices,
          uvs,
          triangles,
          edgeIndices,
        });
        if (markDirty) markDirty();
      }
      if (enterEditMode && sendWorkflowEvent) {
        sendWorkflowEvent({ type: "ENTER_MESH_EDIT" });
      }
      const bindResult = bindingOutcome.current;
      if (bindResult && !bindResult.bound) {
        const message =
          bindResult.reason === "missing-bone"
            ? "Mesh generated unbound: assigned bone no longer exists."
            : "Mesh generated unbound: assign this layer to a bone or bind weights before animating.";
        showCanvasNotice(message);
      }
    },
    [
      meshWorkerClient,
      sceneGatewayRef,
      markDirty,
      updateProject,
      sendWorkflowEvent,
    ],
  );

  const remeshPart = useCallback(
    (partId: string, opts?: MeshGenerationOptions, switchTool = true): void => {
      if (useEditorStore.getState().editorMode === "animation") {
        showCanvasNotice(
          "Mesh editing is locked in Animation mode. Switch to Staging mode.",
        );
        return;
      }
      const project = projectRef.current;
      const node = project.nodes.find((n) => n.id === partId);
      if (!isPartNodeLike(node)) {
        showCanvasNotice(
          "Cannot generate mesh: selected layer no longer exists.",
        );
        return;
      }
      const textureId = node.textureId ?? node.id;
      const tex = project.textures.find((t) => t.id === textureId);
      if (!tex?.source) {
        showCanvasNotice(
          "Cannot generate mesh: texture is missing for this layer.",
        );
        return;
      }
      const img = new Image();
      img.onload = async () => {
        try {
          const off = document.createElement("canvas");
          off.width = img.width;
          off.height = img.height;
          const ctx = off.getContext("2d");
          if (!ctx) throw new Error("2D canvas context unavailable");
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          await dispatchMeshWorker(partId, imageData, opts, false);
          if (switchTool !== false && sendWorkflowEvent) {
            sendWorkflowEvent({ type: "SET_TOOL", tool: "meshAdjust" });
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "unknown error";
          showCanvasNotice(`Mesh generation failed: ${message}`);
        }
      };
      img.onerror = () =>
        showCanvasNotice("Cannot generate mesh: texture failed to load.");
      img.src = tex.source;
    },
    [projectRef, dispatchMeshWorker, sendWorkflowEvent],
  );

  const autoMeshAllParts = useCallback((): void => {
    const project = projectRef.current;
    const parts = project.nodes.filter(
      (node): node is PartNode => isPartNodeLike(node) && !node.mesh,
    );
    for (const node of parts) {
      const opts = computeSmartMeshOpts(node.imageBounds);
      remeshPart(node.id, opts, false);
    }
  }, [projectRef, remeshPart]);

  const deleteMeshForPart = useCallback(
    (partId: string): void => {
      if (useEditorStore.getState().editorMode === "animation") return;
      if (!updateProject) return;
      updateProject((p) => {
        const n = p.nodes.find((x) => x.id === partId);
        if (isPartNodeLike(n)) n.mesh = null;
      });
    },
    [updateProject],
  );

  return {
    dispatchMeshWorker,
    remeshPart,
    autoMeshAllParts,
    deleteMeshForPart,
    getRemeshImpact,
  };
}
