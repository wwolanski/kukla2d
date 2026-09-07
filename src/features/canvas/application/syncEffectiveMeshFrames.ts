import type { Mesh, ProjectDocument, Vertex } from "@kukla2d/contracts";

import type { EffectiveMeshFrame } from "@/features/canvas/domain/meshDeformation.types.js";

interface MeshPositionGateway {
  uploadPositions(
    partId: string,
    vertices: readonly Vertex[],
    uvs: Mesh["uvs"],
  ): void;
}

function hasMesh(value: unknown): value is { mesh: Mesh } {
  return (
    typeof value === "object" &&
    value !== null &&
    "mesh" in value &&
    (value as { mesh?: unknown }).mesh != null
  );
}

/**
 * Synchronizes effective mesh frames to the GPU.
 *
 * Uses final vertex positions computed by the deformation pipeline
 * (mesh_verts, skinning, warp ancestors) and uploads them via the gateway.
 * PixiResourceRegistry.uploadPositions handles topology changes and
 * mutable buffer updates, so we never rebuild a full Pixi Mesh per frame
 * when only positions changed.
 */
export function syncEffectiveMeshFrames({
  gateway,
  project,
  effectiveMeshes,
  previousIds,
}: {
  gateway: MeshPositionGateway;
  project: ProjectDocument;
  effectiveMeshes: ReadonlyMap<string, EffectiveMeshFrame> | null | undefined;
  previousIds: Iterable<string> | null | undefined;
}): Set<string> {
  const nextIds = new Set<string>();
  for (const [partId, frame] of effectiveMeshes ?? []) {
    if (!frame?.vertices?.length) continue;
    nextIds.add(partId);
    gateway.uploadPositions(partId, frame.vertices, frame.uvs);
  }

  // Reset parts that disappeared from the effective mesh set back to setup.
  for (const partId of previousIds ?? []) {
    if (nextIds.has(partId)) continue;
    const node = project?.nodes?.find((candidate) => candidate.id === partId);
    if (hasMesh(node) && node.mesh.vertices.length) {
      gateway.uploadPositions(partId, node.mesh.vertices, node.mesh.uvs);
    }
  }

  return nextIds;
}
