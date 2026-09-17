import type { Bone } from "@kukla2d/contracts";

export type BoneOverride = Partial<
  Pick<Bone["setup"], "x" | "y" | "rotation" | "scaleX" | "scaleY" | "length">
>;
