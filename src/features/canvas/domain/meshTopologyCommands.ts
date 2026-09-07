import type {
  AnimationId,
  Mesh,
  PartNode,
  ProjectDocument,
} from "@kukla2d/contracts";

import { retriangulate } from "./mesh-generation/generate.js";

import type { MeshGenerationResult } from "./mesh-generation/generate.types.js";
import type { MeshTopologyImpact } from "./meshTopologyCommands.types.js";

interface MeshTrackAddress {
  animationId: AnimationId;
  trackIndex: number;
}

type MeshTopologyOperation =
  | {
      type: "add";
      vertex: { x: number; y: number };
      imageWidth: number;
      imageHeight: number;
    }
  | { type: "remove"; vertexIndex: number }
  | {
      type: "remesh";
      mesh: MeshGenerationResult | Mesh;
      imageWidth?: number;
      imageHeight?: number;
    };

interface MeshTopologySummary {
  changed: boolean;
  operation?: MeshTopologyOperation["type"];
  vertexCountDelta?: number;
  clearedBlendShapeIds?: string[];
  clearedTrackAddresses?: MeshTrackAddress[];
}

interface MeshTopologyChangeResult {
  affectedIds: string[];
  summary: MeshTopologySummary;
}

function isPartWithMesh(
  node: ProjectDocument["nodes"][number] | undefined,
): node is PartNode & { mesh: Mesh } {
  return node?.type === "part" && node.mesh != null;
}

export function analyzeMeshTopologyImpact(
  project: ProjectDocument,
  nodeId: string,
  nextVertexCount: number,
): MeshTopologyImpact {
  const node = project.nodes.find((n) => n.id === nodeId);
  if (!isPartWithMesh(node)) {
    return {
      vertexCountChanged: false,
      blendShapeIds: [],
      meshTrackAddresses: [],
      hasWeights: false,
    };
  }

  const currentCount = node.mesh.vertices?.length ?? 0;
  const vertexCountChanged = nextVertexCount !== currentCount;

  const blendShapeIds = (node.blendShapes ?? []).map((s) => s.id);

  const meshTrackAddresses: MeshTrackAddress[] = [];
  for (const animation of project.animations ?? []) {
    for (let ti = 0; ti < (animation.tracks?.length ?? 0); ti++) {
      const track = animation.tracks[ti]!;
      if (track.targetId === nodeId && track.property === "mesh_verts") {
        meshTrackAddresses.push({ animationId: animation.id, trackIndex: ti });
      }
    }
  }

  const hasWeights = !!(
    (node.mesh.influences?.length ?? 0) > 0 ||
    (node.mesh.boneWeights?.length ?? 0) > 0
  );

  return { vertexCountChanged, blendShapeIds, meshTrackAddresses, hasWeights };
}

export function applyMeshTopologyChange(
  project: ProjectDocument,
  nodeId: string,
  operation: MeshTopologyOperation,
): MeshTopologyChangeResult {
  const node = project.nodes.find((n) => n.id === nodeId);
  if (!isPartWithMesh(node))
    return { affectedIds: [], summary: { changed: false } };

  const affectedIds: string[] = [nodeId];
  const summary: MeshTopologySummary = {
    changed: true,
    operation: operation.type,
  };

  if (operation.type === "add") {
    return applyAdd(project, node, nodeId, operation, affectedIds, summary);
  }
  if (operation.type === "remove") {
    return applyRemove(project, node, nodeId, operation, affectedIds, summary);
  }
  if (operation.type === "remesh") {
    return applyRemesh(project, node, nodeId, operation, affectedIds, summary);
  }

  return { affectedIds: [], summary: { changed: false } };
}

function applyAdd(
  project: ProjectDocument,
  node: PartNode & { mesh: Mesh },
  nodeId: string,
  operation: Extract<MeshTopologyOperation, { type: "add" }>,
  affectedIds: string[],
  summary: MeshTopologySummary,
): MeshTopologyChangeResult {
  const { vertex, imageWidth, imageHeight } = operation;
  const mesh = node.mesh;
  const oldCount = mesh.vertices.length;

  mesh.vertices = [
    ...mesh.vertices,
    { x: vertex.x, y: vertex.y, restX: vertex.x, restY: vertex.y },
  ];

  const oldUvs =
    mesh.uvs instanceof Float32Array ? mesh.uvs : new Float32Array(mesh.uvs);
  const newUvs = new Float32Array((oldCount + 1) * 2);
  newUvs.set(oldUvs);
  newUvs[oldCount * 2] = vertex.x / (imageWidth || 1);
  newUvs[oldCount * 2 + 1] = vertex.y / (imageHeight || 1);

  const edgeSet = new Set(
    mesh.edgeIndices instanceof Set
      ? mesh.edgeIndices
      : (mesh.edgeIndices ?? []),
  );
  const result = retriangulate(mesh.vertices, newUvs, edgeSet);

  mesh.uvs = Array.from(result.uvs);
  mesh.triangles = result.triangles;
  mesh.edgeIndices =
    result.edgeIndices instanceof Set
      ? Array.from(result.edgeIndices)
      : result.edgeIndices;

  if (mesh.influences?.length) {
    if (mesh.influences.length === oldCount)
      mesh.influences = [...mesh.influences, []];
    else delete mesh.influences;
  }
  if (mesh.boneWeights?.length) {
    if (mesh.boneWeights.length === oldCount)
      mesh.boneWeights = [...mesh.boneWeights, 0];
    else delete mesh.boneWeights;
  }
  for (const shape of node.blendShapes ?? []) {
    if (shape.deltas?.length === oldCount) {
      shape.deltas = [...shape.deltas, { dx: 0, dy: 0 }];
    }
  }

  adjustMeshTracksOnAdd(project, nodeId, oldCount);

  summary.vertexCountDelta = 1;
  return { affectedIds, summary };
}

function applyRemove(
  project: ProjectDocument,
  node: PartNode & { mesh: Mesh },
  nodeId: string,
  operation: Extract<MeshTopologyOperation, { type: "remove" }>,
  affectedIds: string[],
  summary: MeshTopologySummary,
): MeshTopologyChangeResult {
  const { vertexIndex } = operation;
  const mesh = node.mesh;
  const oldCount = mesh.vertices.length;

  if (vertexIndex < 0 || vertexIndex >= oldCount || oldCount <= 3) {
    return { affectedIds: [], summary: { changed: false } };
  }

  mesh.vertices = mesh.vertices.filter((_, i) => i !== vertexIndex);

  const oldUvs =
    mesh.uvs instanceof Float32Array ? mesh.uvs : new Float32Array(mesh.uvs);
  const newUvs = new Float32Array((oldCount - 1) * 2);
  for (let t = 0, s = 0; t < oldCount - 1; t++, s++) {
    if (s === vertexIndex) s++;
    newUvs[t * 2] = oldUvs[s * 2] ?? 0;
    newUvs[t * 2 + 1] = oldUvs[s * 2 + 1] ?? 0;
  }

  const edges = new Set<number>();
  for (const edge of mesh.edgeIndices ?? []) {
    if (edge < vertexIndex) edges.add(edge);
    else if (edge > vertexIndex) edges.add(edge - 1);
  }

  const result = retriangulate(mesh.vertices, newUvs, edges);
  mesh.uvs = Array.from(result.uvs);
  mesh.triangles = result.triangles;
  mesh.edgeIndices =
    result.edgeIndices instanceof Set
      ? Array.from(result.edgeIndices)
      : result.edgeIndices;

  if (mesh.influences?.length) {
    if (mesh.influences.length === oldCount)
      mesh.influences = mesh.influences.filter((_, i) => i !== vertexIndex);
    else delete mesh.influences;
  }
  if (mesh.boneWeights?.length) {
    if (mesh.boneWeights.length === oldCount)
      mesh.boneWeights = mesh.boneWeights.filter((_, i) => i !== vertexIndex);
    else delete mesh.boneWeights;
  }
  for (const shape of node.blendShapes ?? []) {
    if (shape.deltas?.length === oldCount) {
      shape.deltas = shape.deltas.filter((_, i) => i !== vertexIndex);
    }
  }

  adjustMeshTracksOnRemove(project, nodeId, vertexIndex, oldCount);

  summary.vertexCountDelta = -1;
  return { affectedIds, summary };
}

function applyRemesh(
  project: ProjectDocument,
  node: PartNode & { mesh: Mesh },
  nodeId: string,
  operation: Extract<MeshTopologyOperation, { type: "remesh" }>,
  affectedIds: string[],
  summary: MeshTopologySummary,
): MeshTopologyChangeResult {
  const { mesh: newMesh, imageWidth, imageHeight } = operation;
  const currentCount = node.mesh.vertices?.length ?? 0;

  node.mesh = {
    vertices: newMesh.vertices,
    uvs:
      newMesh.uvs instanceof Float32Array
        ? Array.from(newMesh.uvs)
        : newMesh.uvs,
    triangles: newMesh.triangles,
    edgeIndices:
      newMesh.edgeIndices instanceof Set
        ? Array.from(newMesh.edgeIndices)
        : newMesh.edgeIndices,
  };

  if (imageWidth != null) node.imageWidth = imageWidth;
  if (imageHeight != null) node.imageHeight = imageHeight;

  const clearedBlendShapeIds = (node.blendShapes ?? []).map((s) => s.id);
  node.blendShapes = [];
  node.blendShapeValues = {};

  delete node.mesh.influences;
  delete node.mesh.boneWeights;

  const clearedTrackAddresses: MeshTrackAddress[] = [];
  for (const animation of project.animations ?? []) {
    const toRemove: number[] = [];
    for (let ti = 0; ti < (animation.tracks?.length ?? 0); ti++) {
      const track = animation.tracks[ti]!;
      if (track.targetId === nodeId && track.property === "mesh_verts") {
        clearedTrackAddresses.push({
          animationId: animation.id,
          trackIndex: ti,
        });
        toRemove.push(ti);
      }
    }
    for (let i = toRemove.length - 1; i >= 0; i--) {
      animation.tracks.splice(toRemove[i]!, 1);
    }
  }

  summary.clearedBlendShapeIds = clearedBlendShapeIds;
  summary.clearedTrackAddresses = clearedTrackAddresses;
  summary.vertexCountDelta = (newMesh.vertices?.length ?? 0) - currentCount;
  return { affectedIds, summary };
}

function isPoint(value: unknown): value is { x: number; y: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { x?: unknown }).x === "number" &&
    typeof (value as { y?: unknown }).y === "number"
  );
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function adjustMeshTracksOnAdd(
  project: ProjectDocument,
  nodeId: string,
  oldCount: number,
): void {
  for (const animation of project.animations ?? []) {
    const toRemove: number[] = [];
    for (let ti = 0; ti < (animation.tracks?.length ?? 0); ti++) {
      const track = animation.tracks[ti]!;
      if (track.targetId !== nodeId || track.property !== "mesh_verts")
        continue;
      let removeTrack = false;
      for (const kf of track.keyframes ?? []) {
        if (isUnknownArray(kf.value) && kf.value.length === oldCount) {
          const last = kf.value[oldCount - 1];
          kf.value = [
            ...kf.value,
            isPoint(last) ? { x: last.x, y: last.y } : { x: 0, y: 0 },
          ];
        } else {
          removeTrack = true;
          break;
        }
      }
      if (removeTrack) toRemove.push(ti);
    }
    for (let i = toRemove.length - 1; i >= 0; i--) {
      animation.tracks.splice(toRemove[i]!, 1);
    }
  }
}

function adjustMeshTracksOnRemove(
  project: ProjectDocument,
  nodeId: string,
  vertexIndex: number,
  oldCount: number,
): void {
  for (const animation of project.animations ?? []) {
    const toRemove: number[] = [];
    for (let ti = 0; ti < (animation.tracks?.length ?? 0); ti++) {
      const track = animation.tracks[ti]!;
      if (track.targetId !== nodeId || track.property !== "mesh_verts")
        continue;
      let removeTrack = false;
      for (const kf of track.keyframes ?? []) {
        if (isUnknownArray(kf.value) && kf.value.length === oldCount) {
          kf.value = kf.value.filter((_, i) => i !== vertexIndex);
        } else {
          removeTrack = true;
          break;
        }
      }
      if (removeTrack) toRemove.push(ti);
    }
    for (let i = toRemove.length - 1; i >= 0; i--) {
      animation.tracks.splice(toRemove[i]!, 1);
    }
  }
}
