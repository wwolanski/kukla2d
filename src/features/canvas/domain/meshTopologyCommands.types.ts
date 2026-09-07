import type { AnimationId } from "@kukla2d/contracts";

export interface MeshTopologyImpact {
  vertexCountChanged: boolean;
  blendShapeIds: string[];
  meshTrackAddresses: Array<{ animationId: AnimationId; trackIndex: number }>;
  hasWeights: boolean;
}
