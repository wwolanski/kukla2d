import type { Mesh } from "@kukla2d/contracts";

interface Point {
  x: number;
  y: number;
}

export interface EffectiveMeshFrame {
  partId: string;
  vertices: Point[];
  uvs: Mesh["uvs"];
  triangles: Mesh["triangles"];
  source: "poseOverride" | "setup" | "setup(mismatch)";
}
