import type { BoneId } from "@kukla2d/contracts";

export interface Vector2 {
  x: number;
  y: number;
}

export type PhysicsOutput =
  | {
      type: "rotation";
      boneId: BoneId;
      mix: number;
      rootParticleId?: string;
      particleId: string;
    }
  | {
      type: "translation";
      boneId: BoneId;
      mix: number;
      rootParticleId?: string;
      particleId: string;
    };

export interface PhysicsRig {
  id: string;
  name: string;
  particles: Array<{
    id: string;
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    mass: number;
    damping: number;
    pinned: boolean;
  }>;
  links: Array<{
    fromParticleId: string;
    toParticleId: string;
    restLength: number;
    stiffness: number;
  }>;
  outputs: PhysicsOutput[];
  gravity: Vector2;
  wind: Vector2;
  iterations: number;
  tags: string[];
  /** Solver-owned fixed-step remainder. */
  _accumulator?: number;
}

export type PhysicsRigDiagnostic =
  | { code: "EMPTY_RIG" }
  | { code: "DUPLICATE_PARTICLE_ID"; particleId: string }
  | { code: "MISSING_LINK_PARTICLE"; particleId: string }
  | { code: "MISSING_OUTPUT_PARTICLE"; particleId: string }
  | { code: "INVALID_NUMERIC_VALUE"; field: string };
