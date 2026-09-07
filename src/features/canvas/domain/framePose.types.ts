import type { Bone, Node } from "@kukla2d/contracts";

import type { PoseOverrides } from "@/domain/animationEngine.types.js";

import type { EffectiveMeshFrame } from "./meshDeformation.types.js";

export interface FrameAnimationState {
  activeAnimationId: string | null;
  currentTime: number;
  endFrame: number;
  fps: number;
  loopKeyframes: boolean;
  draftPose: Map<string, Record<string, unknown>>;
}

export interface FramePose {
  poseOverrides: PoseOverrides | null;
  effectiveNodes: Node[];
  effectiveBones: Bone[];
  effectiveMeshes: Map<string, EffectiveMeshFrame>;
  physicsActive: boolean;
  preLinkedNodes: Node[];
}
