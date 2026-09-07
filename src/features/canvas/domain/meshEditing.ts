/**
 * Pure mesh helpers - editing, weights, options.
 *
 * `meshOptions` contains bounds-only math.
 * `meshWeights` exposes pure brush and influence normalization helpers.
 * Mesh generation delegates to the pure `mesh-generation/generate` module.
 */
import type {
  BoneId,
  Mesh,
  NodeId,
  Vertex,
  VertexInfluence,
} from "@kukla2d/contracts";

import { retriangulate } from "./mesh-generation/generate.js";
import { applyWeightBrush } from "./meshWeighting.js";

import type { MeshGenerationOptions } from "./mesh-generation/generate.types.js";

interface ImageBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
interface GeneratedVertex extends Vertex {
  restX: number;
  restY: number;
}
type EditableMesh = Omit<Mesh, "vertices" | "edgeIndices"> & {
  vertices: GeneratedVertex[];
  edgeIndices: number[] | Set<number>;
  imageWidth?: number;
  imageHeight?: number;
};

/* ── meshOptions ─────────────────────────────────────────────────────────── */

export const SMART_MESH_DEFAULTS = {
  alphaThreshold: 5,
  smoothPasses: 0,
  gridSpacing: 30,
  edgePadding: 8,
  numEdgePoints: 80,
};

export const SMART_MESH_LIMITS = {
  alphaThreshold: 5,
  smoothPasses: 0,
  gridSpacing: { min: 6, max: 80, multiplier: 0.08 },
  edgePadding: 8,
  numEdgePoints: { min: 12, max: 300, multiplier: 0.4 },
};

/**
 * Compute smart mesh options based on part surface area.
 * Missing image bounds fall back to `SMART_MESH_DEFAULTS`.
 */
export function computeSmartMeshOpts(
  imageBounds: ImageBounds | null | undefined,
): Required<MeshGenerationOptions> {
  if (!imageBounds) {
    return { ...SMART_MESH_DEFAULTS };
  }
  const w = imageBounds.maxX - imageBounds.minX;
  const h = imageBounds.maxY - imageBounds.minY;
  const sqrtArea = Math.sqrt(w * h);
  return {
    alphaThreshold: SMART_MESH_LIMITS.alphaThreshold,
    smoothPasses: SMART_MESH_LIMITS.smoothPasses,
    gridSpacing: Math.max(
      SMART_MESH_LIMITS.gridSpacing.min,
      Math.min(
        SMART_MESH_LIMITS.gridSpacing.max,
        Math.round(sqrtArea * SMART_MESH_LIMITS.gridSpacing.multiplier),
      ),
    ),
    edgePadding: SMART_MESH_LIMITS.edgePadding,
    numEdgePoints: Math.max(
      SMART_MESH_LIMITS.numEdgePoints.min,
      Math.min(
        SMART_MESH_LIMITS.numEdgePoints.max,
        Math.round(sqrtArea * SMART_MESH_LIMITS.numEdgePoints.multiplier),
      ),
    ),
  };
}

/* ── meshWeights ─────────────────────────────────────────────────────────── */

/**
 * Brush falloff weight. t = dist/radius (0=center, 1=edge).
 * hardness=1 → uniform weight=1; hardness=0 → smooth cosine falloff.
 */
export function brushWeight(
  dist: number,
  radius: number,
  hardness: number,
): number {
  const t = dist / radius;
  if (t >= 1) return 0;
  const soft = 0.5 * (1 + Math.cos(Math.PI * t));
  return hardness + (1 - hardness) * soft;
}

/**
 * Normalize vertex influences: filter near-zero, keep top-4 by weight,
 * then renormalize the kept set so their weights sum to ~1.
 */
export function normalizeVertexInfluences(
  influences: readonly VertexInfluence[] | null | undefined,
): VertexInfluence[] {
  const byBone = new Map<BoneId, number>();
  for (const inf of influences ?? []) {
    if (!inf?.boneId || !Number.isFinite(inf.weight) || inf.weight <= 0.0001)
      continue;
    byBone.set(inf.boneId, (byBone.get(inf.boneId) ?? 0) + inf.weight);
  }
  const top = Array.from(byBone, ([boneId, weight]) => ({ boneId, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
  const sum = top.reduce((acc, inf) => acc + inf.weight, 0);
  if (sum <= 0) return [];
  return top.map((inf) => ({ boneId: inf.boneId, weight: inf.weight / sum }));
}

/**
 * Paint mesh weights for `partId` in `project` (mutates `project`).
 * Extracted from `CanvasViewport` without changing behavior.
 */
export function paintMeshWeights(
  project: { nodes: Array<{ id: string; mesh?: Mesh | null }> },
  partId: NodeId,
  boneId: BoneId,
  localX: number,
  localY: number,
  radius: number,
  hardness: number,
  strength: number,
): void {
  const node = project.nodes.find((n) => n.id === partId);
  if (!node?.mesh?.vertices.length) return;
  applyWeightBrush({
    mesh: node.mesh,
    boneId,
    localX,
    localY,
    radius,
    hardness,
    settings: { mode: "replace", strength: 1, targetWeight: strength },
  });
}

/* ── meshEditing ─────────────────────────────────────────────────────────── */

/**
 * Add a vertex at local (x, y) within image bounds and re-triangulate.
 * Returns a new mesh without mutating input.
 *
 * @param {Object} args
 * @param {Object} args.mesh              - input mesh { vertices, uvs, triangles, edgeIndices }
 * @param {number} args.localX
 * @param {number} args.localY
 * @param {number} args.imageWidth
 * @param {number} args.imageHeight
 * @returns {Object} new mesh
 */
export function buildAddVertexMesh({
  mesh,
  localX,
  localY,
  imageWidth,
  imageHeight,
}: {
  mesh: EditableMesh;
  localX: number;
  localY: number;
  imageWidth: number;
  imageHeight: number;
}): EditableMesh {
  const verticesSnap = [
    ...(mesh.vertices ?? []),
    { x: localX, y: localY, restX: localX, restY: localY },
  ];
  const result = retriangulate(
    verticesSnap,
    new Float32Array(mesh.uvs),
    edgeIndicesAsSet(mesh.edgeIndices, verticesSnap.length),
  );
  return { ...mesh, ...result, imageWidth, imageHeight };
}

function edgeIndicesAsSet(
  edgeIndices: readonly number[] | Set<number> | null | undefined,
  length: number,
): Set<number> {
  if (edgeIndices instanceof Set) return edgeIndices;
  if (edgeIndices) return new Set<number>(edgeIndices);
  // fallback: all vertices are edge vertices
  return new Set(Array.from({ length }, (_, i) => i));
}

/**
 * Remove a vertex at `vertexIndex` and re-triangulate.
 * Returns a new mesh without mutating input.
 */
export function buildRemoveVertexMesh({
  mesh,
  vertexIndex,
  imageWidth,
  imageHeight,
}: {
  mesh: EditableMesh;
  vertexIndex: number;
  imageWidth: number;
  imageHeight: number;
}): EditableMesh {
  const verticesSnap = (mesh.vertices ?? []).filter(
    (_, i) => i !== vertexIndex,
  );
  const result = retriangulate(
    verticesSnap,
    new Float32Array(mesh.uvs),
    edgeIndicesAsSet(mesh.edgeIndices, verticesSnap.length),
  );
  return { ...mesh, ...result, imageWidth, imageHeight };
}

/**
 * Build new vertices after brush deform.
 * Pure helper; does not mutate input.
 */
export function buildBrushVertices({
  verticesSnap,
  affected,
  localDx,
  localDy,
}: {
  verticesSnap: readonly Vertex[];
  affected: readonly boolean[];
  localDx: number;
  localDy: number;
}): Vertex[] {
  return verticesSnap.map((v, i) => {
    if (!affected[i]) return v;
    return { x: v.x + localDx, y: v.y + localDy };
  });
}
