import type {
  BoneId,
  Mesh,
  NodeId,
  PartNode,
  Vertex,
} from "@kukla2d/contracts";

import {
  computeWorldMatrices,
  mat3Inverse,
  mat3Identity,
} from "@/domain/transforms";
import type { Matrix3 } from "@/domain/transforms.types.js";

import { worldToLocal } from "@/features/canvas/domain/coordinates.js";
import { brushWeight } from "@/features/canvas/domain/meshEditing.js";
import { applyMeshTopologyChange } from "@/features/canvas/domain/meshTopologyCommands.js";
import { applyWeightBrush } from "@/features/canvas/domain/meshWeighting.js";
import { findNearestVertex } from "@/features/canvas/domain/picking.js";

import { getEffectiveNodes } from "./PixiInputState.js";

import type { PixiInteractionSystem } from "./PixiInteractionSystem.js";

interface WorldPoint {
  x: number;
  y: number;
}
interface MeshCandidates {
  alphaHit: string | null;
  boneHit: string | null;
}
type MeshPart = PartNode & { mesh: Mesh };

export function startMeshGesture(
  adapter: PixiInteractionSystem,
  world: WorldPoint,
  candidates?: MeshCandidates,
): boolean {
  const editorState = adapter.editorRef.current;
  if (
    !editorState.meshEditMode &&
    !editorState.weightPaintMode &&
    !editorState.blendShapeEditMode
  )
    return false;
  const selectedId = editorState.selection?.[0];
  const effectiveNodes = getEffectiveNodes({
    project: adapter.projectRef.current,
    editor: editorState,
    animation: adapter.animationRef.current,
  });
  const node = effectiveNodes.find(
    (candidate): candidate is MeshPart =>
      candidate.id === selectedId &&
      candidate.type === "part" &&
      !!candidate.mesh,
  );
  if (!node) {
    return candidates ? false : true;
  }
  if (candidates) {
    if (candidates.boneHit) return false;
    if (candidates.alphaHit && candidates.alphaHit !== node.id) return false;
  }

  const inverse = mat3Inverse(
    computeWorldMatrices(effectiveNodes).get(node.id) ?? mat3Identity(),
  );
  const [localX, localY] = worldToLocal(world.x, world.y, inverse);
  const radius = (editorState.brushSize ?? 30) / (editorState.view?.zoom || 1);

  if (editorState.weightPaintMode) {
    if (editorState.editorMode === "animation") return false;
    const paintBone = adapter.projectRef.current.bones.find(
      (bone) => bone.id === editorState.weightPaintBoneId,
    );
    if (!paintBone) return false;
    adapter._captureGestureSnapshot?.();
    const initialInfluences = cloneValue(node.mesh.influences);
    adapter._beginCommandBatch({ name: "Weight paint", type: "weightPaint" });
    paintWeight(adapter, node.id, paintBone.id, inverse, world);
    adapter._setDragState({
      type: "weightPaint",
      partId: node.id,
      boneId: paintBone.id,
      inverse,
      initialInfluences,
    });
    adapter._sendWorkflow({
      type: "START_WEIGHT_PAINT",
      payload: { partId: node.id, boneId: paintBone.id },
    });
    return true;
  }

  if (editorState.editorMode === "animation" && editorState.meshEditMode) {
    if (
      editorState.toolMode === "add_vertex" ||
      editorState.toolMode === "remove_vertex" ||
      editorState.meshSubMode === "adjust"
    ) {
      return false;
    }
  }

  if (editorState.toolMode === "add_vertex") {
    addVertex(adapter, node, localX, localY);
    return true;
  }
  if (editorState.toolMode === "remove_vertex") {
    removeVertex(adapter, node, localX, localY);
    return true;
  }

  const vertices = effectiveVertices(adapter, node);
  const affected = vertices.flatMap((vertex, index) => {
    const distance = Math.hypot(vertex.x - localX, vertex.y - localY);
    const weight =
      editorState.meshSubMode === "deform"
        ? brushWeight(distance, radius, editorState.brushHardness)
        : distance <= 14 / (editorState.view?.zoom || 1)
          ? 1
          : 0;
    return weight > 0
      ? [{ index, startX: vertex.x, startY: vertex.y, weight }]
      : [];
  });
  if (!affected.length && editorState.meshSubMode !== "deform") return true;

  adapter._beginCommandBatch({ name: "Mesh brush", type: "meshBrush" });
  adapter._setDragState({
    type: "meshBrush",
    partId: node.id,
    startWorldX: world.x,
    startWorldY: world.y,
    verticesSnap: vertices.map((v) => ({ ...v })),
    allUvs: new Float32Array(node.mesh.uvs),
    imageWidth: node.imageWidth,
    imageHeight: node.imageHeight,
    affected,
    inverse,
    initialVertices: cloneValue(node.mesh.vertices),
    initialUvs: Array.from(node.mesh.uvs),
    initialShapeDeltas: cloneValue(
      node.blendShapes?.find(
        (shape) => shape.id === editorState.activeBlendShapeId,
      )?.deltas ?? null,
    ),
  });
  adapter._sendWorkflow({
    type: "START_MESH_BRUSH",
    payload: { partId: node.id, mode: editorState.meshSubMode },
  });
  return true;
}

export function moveMeshGesture(
  adapter: PixiInteractionSystem,
  world: WorldPoint,
): boolean {
  const drag = adapter._dragState;
  if (drag?.type === "weightPaint") {
    paintWeight(adapter, drag.partId, drag.boneId, drag.inverse, world);
    adapter._sendWorkflow({
      type: "MOVE_GESTURE",
      payload: {
        mode: "weightPaint",
        partId: drag.partId,
        boneId: drag.boneId,
        worldX: world.x,
        worldY: world.y,
      },
    });
    return true;
  }
  if (drag?.type !== "meshBrush") return false;

  const localDx =
    drag.inverse[0] * (world.x - drag.startWorldX) +
    drag.inverse[3] * (world.y - drag.startWorldY);
  const localDy =
    drag.inverse[1] * (world.x - drag.startWorldX) +
    drag.inverse[4] * (world.y - drag.startWorldY);
  const vertices = drag.verticesSnap.map((vertex) => ({ ...vertex }));
  for (const point of drag.affected) {
    const vertex = vertices[point.index];
    if (!vertex) continue;
    vertex.x = point.startX + localDx * point.weight;
    vertex.y = point.startY + localDy * point.weight;
  }

  const editorState = adapter.editorRef.current;
  if (editorState.blendShapeEditMode) {
    adapter._executeCommand({
      type: "updateProject",
      payload: {
        mutator: (project) => {
          const node = project.nodes.find((item) => item.id === drag.partId);
          if (node?.type !== "part" || !node.mesh) return;
          const shape = node.blendShapes?.find(
            (item) => item.id === editorState.activeBlendShapeId,
          );
          if (!shape) return;
          for (const point of drag.affected) {
            const vertex = vertices[point.index];
            const meshVertex = node.mesh.vertices[point.index];
            if (!vertex || !meshVertex) continue;
            shape.deltas[point.index] = {
              dx: vertex.x - (meshVertex.restX ?? meshVertex.x),
              dy: vertex.y - (meshVertex.restY ?? meshVertex.y),
            };
          }
        },
      },
    });
  } else if (
    editorState.editorMode === "animation" &&
    editorState.meshSubMode === "deform"
  ) {
    if (vertices.length === drag.verticesSnap.length) {
      if (adapter.animationAuthoringAdapter?.previewPartial) {
        adapter.animationAuthoringAdapter.previewPartial(drag.partId, {
          mesh_verts: vertices,
        });
      } else {
        adapter.animationRef.current.setDraftPose(drag.partId, {
          mesh_verts: vertices,
        });
      }
    }
  } else {
    adapter._executeCommand({
      type: "updateProject",
      payload: {
        mutator: (project) => {
          const node = project.nodes.find((item) => item.id === drag.partId);
          if (node?.type !== "part" || !node.mesh) return;
          for (const point of drag.affected) {
            const targetVertex = node.mesh.vertices[point.index];
            const sourceVertex = vertices[point.index];
            if (!targetVertex || !sourceVertex) continue;
            targetVertex.x = sourceVertex.x;
            targetVertex.y = sourceVertex.y;
            if (editorState.meshSubMode === "adjust") {
              node.mesh.uvs[point.index * 2] =
                sourceVertex.x / (drag.imageWidth || 1);
              node.mesh.uvs[point.index * 2 + 1] =
                sourceVertex.y / (drag.imageHeight || 1);
            }
          }
        },
      },
    });
  }
  const currentUvs =
    editorState.meshSubMode === "adjust"
      ? adapter.projectRef.current.nodes.find(
          (node): node is MeshPart =>
            node.id === drag.partId && node.type === "part" && !!node.mesh,
        )?.mesh.uvs
      : drag.allUvs;
  adapter.uploadPositions?.(
    drag.partId,
    vertices,
    new Float32Array(currentUvs ?? drag.allUvs),
  );
  adapter.markDirty?.();
  adapter._sendWorkflow({
    type: "MOVE_GESTURE",
    payload: {
      mode: "meshBrush",
      partId: drag.partId,
      worldX: world.x,
      worldY: world.y,
    },
  });
  return true;
}

function paintWeight(
  adapter: PixiInteractionSystem,
  partId: NodeId,
  boneId: BoneId,
  inverse: Matrix3,
  world: WorldPoint,
): void {
  const [x, y] = worldToLocal(world.x, world.y, inverse);
  const editorState = adapter.editorRef.current;
  const radius = (editorState.brushSize ?? 30) / (editorState.view?.zoom || 1);
  const mode = editorState.weightPaintBrushMode ?? "add";
  const strength = Math.max(
    0,
    Math.min(1, Number(editorState.weightPaintStrength) || 0),
  );
  const targetWeight = editorState.weightPaintTargetValue ?? 1;
  adapter._executeCommand({
    type: "updateProject",
    payload: {
      mutator: (project) => {
        const node = project.nodes.find((n) => n.id === partId);
        if (node?.type !== "part" || !node.mesh) return;
        applyWeightBrush({
          mesh: node.mesh,
          boneId,
          localX: x,
          localY: y,
          radius,
          hardness: editorState.brushHardness,
          settings: { mode, strength, targetWeight },
        });
      },
    },
  });
  adapter.markDirty?.();
}

function addVertex(
  adapter: PixiInteractionSystem,
  node: MeshPart,
  x: number,
  y: number,
): void {
  const imageWidth = node.imageWidth ?? 1;
  const imageHeight = node.imageHeight ?? 1;
  adapter._executeCommand({
    type: "updateProject",
    payload: {
      mutator: (project) => {
        applyMeshTopologyChange(project, node.id, {
          type: "add",
          vertex: { x, y },
          imageWidth,
          imageHeight,
        });
      },
    },
  });
  const target = adapter.projectRef.current.nodes.find((n) => n.id === node.id);
  if (target?.type === "part" && target.mesh) {
    adapter.uploadMesh?.(node.id, {
      vertices: target.mesh.vertices,
      uvs: new Float32Array(target.mesh.uvs),
      triangles: target.mesh.triangles,
      edgeIndices: target.mesh.edgeIndices,
    });
  }
  adapter.markDirty?.();
}

function removeVertex(
  adapter: PixiInteractionSystem,
  node: MeshPart,
  x: number,
  y: number,
): void {
  const index = findNearestVertex(
    node.mesh.vertices,
    x,
    y,
    14 / (adapter.editorRef.current.view?.zoom || 1),
  );
  if (index < 0 || node.mesh.vertices.length <= 3) return;
  adapter._executeCommand({
    type: "updateProject",
    payload: {
      mutator: (project) => {
        applyMeshTopologyChange(project, node.id, {
          type: "remove",
          vertexIndex: index,
        });
      },
    },
  });
  const target = adapter.projectRef.current.nodes.find((n) => n.id === node.id);
  if (target?.type === "part" && target.mesh) {
    adapter.uploadMesh?.(node.id, {
      vertices: target.mesh.vertices,
      uvs: new Float32Array(target.mesh.uvs),
      triangles: target.mesh.triangles,
      edgeIndices: target.mesh.edgeIndices,
    });
  }
  adapter.markDirty?.();
}

function effectiveVertices(
  adapter: PixiInteractionSystem,
  node: MeshPart,
): Vertex[] {
  const draft = adapter.animationRef.current?.draftPose?.get(
    node.id,
  )?.mesh_verts;
  if (Array.isArray(draft)) {
    const values: unknown[] = draft;
    return values.filter(
      (value): value is Vertex =>
        typeof value === "object" &&
        value !== null &&
        "x" in value &&
        typeof value.x === "number" &&
        "y" in value &&
        typeof value.y === "number",
    );
  }
  if (!adapter.editorRef.current.blendShapeEditMode) return node.mesh.vertices;
  const activeId = adapter.editorRef.current.activeBlendShapeId;
  return node.mesh.vertices.map((vertex, index) => {
    let x = vertex.restX ?? vertex.x;
    let y = vertex.restY ?? vertex.y;
    for (const shape of node.blendShapes ?? []) {
      const delta = shape.deltas[index];
      if (!delta) continue;
      const influence =
        shape.id === activeId ? 1 : (node.blendShapeValues?.[shape.id] ?? 0);
      x += delta.dx * influence;
      y += delta.dy * influence;
    }
    return { x, y };
  });
}

function cloneValue<T>(value: T): T {
  return value == null ? value : structuredClone(value);
}
