import type { Vertex } from "@kukla2d/contracts";

import type { Triangle } from "./delaunay.types.js";

export interface MeshGenerationOptions {
  alphaThreshold?: number;
  smoothPasses?: number;
  gridSpacing?: number;
  edgePadding?: number;
  numEdgePoints?: number;
}

export interface MeshGenerationResult<
  TVertex extends Vertex = Vertex & { restX: number; restY: number },
> {
  vertices: TVertex[];
  uvs: Float32Array;
  triangles: Triangle[];
  edgeIndices: Set<number>;
}
