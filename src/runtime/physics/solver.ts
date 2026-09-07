import type { BoneId } from "@kukla2d/contracts";

import { validatePhysicsRig } from "./physicsRig.js";

import type {
  PhysicsRig,
  PhysicsRigDiagnostic,
  Vector2,
} from "./physicsRig.types.js";

interface PhysicsBoneOverride {
  x?: number;
  y?: number;
  rotation?: number;
}

type PhysicsStepResult =
  | { ok: true; rig: PhysicsRig; substeps: number }
  | {
      ok: false;
      rig: PhysicsRig;
      diagnostics: readonly PhysicsRigDiagnostic[];
    };

/** Mutates solver-owned rig state after validating topology. */
export function stepPhysicsResult(
  rig: PhysicsRig,
  deltaSeconds: number,
  input: Vector2 | null = null,
  maxSubsteps = 4,
): PhysicsStepResult {
  const validation = validatePhysicsRig(rig);
  if (!validation.ok)
    return { ok: false, rig, diagnostics: validation.diagnostics };
  const fixedDelta = 1 / 60;
  rig._accumulator =
    (rig._accumulator ?? 0) + Math.max(0, Math.min(deltaSeconds, 0.25));
  let remainingSubsteps = Math.max(0, Math.floor(maxSubsteps));
  let substeps = 0;
  while (rig._accumulator >= fixedDelta && remainingSubsteps > 0) {
    integrateVerlet(rig, fixedDelta, input);
    solveConstraints(rig);
    rig._accumulator -= fixedDelta;
    remainingSubsteps -= 1;
    substeps += 1;
  }
  return { ok: true, rig, substeps };
}

export function stepPhysics(
  rig: PhysicsRig,
  deltaSeconds: number,
  input: Vector2 | null = null,
  maxSubsteps = 4,
): PhysicsRig {
  return stepPhysicsResult(rig, deltaSeconds, input, maxSubsteps).rig;
}

export function resetPhysics(rig: PhysicsRig): PhysicsRig {
  rig._accumulator = 0;
  for (const particle of rig.particles) {
    particle.prevX = particle.x;
    particle.prevY = particle.y;
  }
  return rig;
}

export function evaluatePhysicsOutputs(
  rig: PhysicsRig,
): Map<BoneId, PhysicsBoneOverride> {
  const overrides = new Map<BoneId, PhysicsBoneOverride>();
  const particleMap = new Map(
    rig.particles.map((particle) => [particle.id, particle]),
  );
  const pinnedRoot = rig.particles.find((particle) => particle.pinned);
  for (const output of rig.outputs) {
    const particle = particleMap.get(output.particleId);
    if (!particle) continue;
    const root = output.rootParticleId
      ? (particleMap.get(output.rootParticleId) ?? pinnedRoot)
      : pinnedRoot;
    const relativeX = particle.x - (root?.x ?? 0);
    const relativeY = particle.y - (root?.y ?? 0);
    const current = overrides.get(output.boneId) ?? {};
    if (output.type === "rotation") {
      current.rotation =
        (current.rotation ?? 0) +
        Math.atan2(relativeX, -relativeY) * (180 / Math.PI) * output.mix;
    } else {
      current.x = (current.x ?? 0) + relativeX * output.mix;
      current.y = (current.y ?? 0) + relativeY * output.mix;
    }
    overrides.set(output.boneId, current);
  }
  return overrides;
}

function solveConstraints(rig: PhysicsRig): void {
  const particleMap = new Map(
    rig.particles.map((particle) => [particle.id, particle]),
  );
  for (let iteration = 0; iteration < rig.iterations; iteration += 1) {
    for (const link of rig.links) {
      const from = particleMap.get(link.fromParticleId);
      const to = particleMap.get(link.toParticleId);
      if (!from || !to) continue;
      const deltaX = to.x - from.x;
      const deltaY = to.y - from.y;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance < 0.0001) continue;
      const correction =
        ((link.restLength - distance) / distance) * link.stiffness * 0.5;
      const correctionX = deltaX * correction;
      const correctionY = deltaY * correction;
      if (!from.pinned) {
        from.x -= correctionX;
        from.y -= correctionY;
      }
      if (!to.pinned) {
        to.x += correctionX;
        to.y += correctionY;
      }
    }
  }
}

function integrateVerlet(
  rig: PhysicsRig,
  deltaSeconds: number,
  input: Vector2 | null,
): void {
  for (const particle of rig.particles) {
    if (particle.pinned) continue;
    const velocityX = (particle.x - particle.prevX) * particle.damping;
    const velocityY = (particle.y - particle.prevY) * particle.damping;
    const accelerationX = rig.gravity.x + rig.wind.x + (input?.x ?? 0);
    const accelerationY = rig.gravity.y + rig.wind.y + (input?.y ?? 0);
    particle.prevX = particle.x;
    particle.prevY = particle.y;
    particle.x += velocityX + accelerationX * deltaSeconds * deltaSeconds;
    particle.y += velocityY + accelerationY * deltaSeconds * deltaSeconds;
  }
}
