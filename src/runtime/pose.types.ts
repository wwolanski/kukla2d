import type { BoneId, NodeId } from "@kukla2d/contracts";

import type { Matrix3 } from "../domain/transforms.types.js";

export interface BoneTransformOverride {
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
}

export type PoseOverrideMap = ReadonlyMap<
  string,
  Readonly<Record<string, unknown>>
>;

export interface EvaluatedPose {
  skinnedMeshes: readonly { nodeId: NodeId; vertices: Float32Array }[];
  /** Runtime owns matrices; consumers must treat them as readonly. */
  boneMatrices: ReadonlyMap<BoneId, Matrix3>;
}
