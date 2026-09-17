import type { Bone, ProjectDocument } from "@kukla2d/contracts";

import type { PoseOverrides } from "@/domain/animationEngine.types.js";

export interface PhysicsRuntime {
  evaluate(args: {
    project: ProjectDocument;
    effectiveBones: readonly Bone[];
    timestamp: number;
    enabled: boolean;
  }): {
    active: boolean;
    overrides: PoseOverrides | null;
  };
  reset?: () => void;
}
