import type { BoneId } from "@kukla2d/contracts";

import { isRecord } from "@/lib/guards";
import { isFiniteNumber } from "@/lib/math";

import type {
  PhysicsOutput,
  PhysicsRig,
  PhysicsRigDiagnostic,
  Vector2,
} from "./physicsRig.types.js";

interface PhysicsParticle {
  id: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  mass: number;
  damping: number;
  pinned: boolean;
}

interface PhysicsLink {
  fromParticleId: string;
  toParticleId: string;
  restLength: number;
  stiffness: number;
}

type PhysicsRigValidation =
  | { ok: true; rig: PhysicsRig; diagnostics: readonly [] }
  | { ok: false; diagnostics: readonly PhysicsRigDiagnostic[] };

export function validatePhysicsRig(value: unknown): PhysicsRigValidation {
  if (
    !isRecord(value) ||
    !Array.isArray(value.particles) ||
    !Array.isArray(value.links) ||
    !Array.isArray(value.outputs) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string"
  ) {
    return {
      ok: false,
      diagnostics: [{ code: "INVALID_NUMERIC_VALUE", field: "rig shape" }],
    };
  }

  const particles: PhysicsParticle[] = [];
  const particleIds = new Set<string>();
  const diagnostics: PhysicsRigDiagnostic[] = [];
  for (const candidate of value.particles) {
    const particle = parseParticle(candidate);
    if (!particle) {
      diagnostics.push({ code: "INVALID_NUMERIC_VALUE", field: "particle" });
      continue;
    }
    if (particleIds.has(particle.id))
      diagnostics.push({
        code: "DUPLICATE_PARTICLE_ID",
        particleId: particle.id,
      });
    particleIds.add(particle.id);
    particles.push(particle);
  }

  const links: PhysicsLink[] = [];
  for (const candidate of value.links) {
    const link = parseLink(candidate);
    if (!link) {
      diagnostics.push({ code: "INVALID_NUMERIC_VALUE", field: "link" });
      continue;
    }
    for (const particleId of [link.fromParticleId, link.toParticleId]) {
      if (!particleIds.has(particleId))
        diagnostics.push({ code: "MISSING_LINK_PARTICLE", particleId });
    }
    links.push(link);
  }

  const outputs: PhysicsOutput[] = [];
  for (const candidate of value.outputs) {
    const output = parseOutput(candidate);
    if (!output) {
      diagnostics.push({ code: "INVALID_NUMERIC_VALUE", field: "output" });
      continue;
    }
    if (!particleIds.has(output.particleId)) {
      diagnostics.push({
        code: "MISSING_OUTPUT_PARTICLE",
        particleId: output.particleId,
      });
    }
    outputs.push(output);
  }

  if (particles.length < 2 || links.length === 0 || outputs.length === 0) {
    diagnostics.push({ code: "EMPTY_RIG" });
  }

  const gravity = parseVector(value.gravity);
  const wind = parseVector(value.wind);
  const iterations = value.iterations;
  if (!gravity || !wind || !isFiniteNumber(iterations) || iterations < 1) {
    diagnostics.push({
      code: "INVALID_NUMERIC_VALUE",
      field: "solver settings",
    });
  }
  if (
    diagnostics.length > 0 ||
    !gravity ||
    !wind ||
    !isFiniteNumber(iterations)
  ) {
    return { ok: false, diagnostics };
  }
  return {
    ok: true,
    diagnostics: [],
    rig: {
      id: value.id,
      name: value.name,
      particles,
      links,
      outputs,
      gravity,
      wind,
      iterations: Math.floor(iterations),
      tags: Array.isArray(value.tags) ? value.tags.filter(isString) : [],
      ...(isFiniteNumber(value._accumulator)
        ? { _accumulator: value._accumulator }
        : {}),
    },
  };
}

export function createPendulumChain(
  id: string,
  name: string,
  boneId: BoneId,
  boneLength: number,
  segments: number,
  tags: readonly string[],
): PhysicsRig {
  const segmentCount = Math.max(
    1,
    Math.floor(Number.isFinite(segments) ? segments : 1),
  );
  const segmentLength = boneLength / segmentCount;
  const particles: PhysicsParticle[] = [];
  const links: PhysicsLink[] = [];
  for (let index = 0; index <= segmentCount; index += 1) {
    particles.push({
      id: `${id}_p${index}`,
      x: 0,
      y: -index * segmentLength,
      prevX: 0,
      prevY: -index * segmentLength,
      mass: 1,
      damping: 0.99,
      pinned: index === 0,
    });
  }
  for (let index = 0; index < segmentCount; index += 1) {
    links.push({
      fromParticleId: `${id}_p${index}`,
      toParticleId: `${id}_p${index + 1}`,
      restLength: segmentLength,
      stiffness: 0.8,
    });
  }
  return {
    id,
    name,
    particles,
    links,
    outputs: [
      {
        type: "rotation",
        boneId,
        mix: 1,
        rootParticleId: `${id}_p0`,
        particleId: `${id}_p${segmentCount}`,
      },
    ],
    gravity: { x: 0, y: -980 },
    wind: { x: 0, y: 0 },
    iterations: 8,
    tags: [...tags],
  };
}

function parseParticle(value: unknown): PhysicsParticle | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.pinned !== "boolean"
  )
    return null;
  if (
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.prevX) ||
    !isFiniteNumber(value.prevY) ||
    !isFiniteNumber(value.mass) ||
    !isFiniteNumber(value.damping)
  )
    return null;
  return {
    id: value.id,
    x: value.x,
    y: value.y,
    prevX: value.prevX,
    prevY: value.prevY,
    mass: value.mass,
    damping: value.damping,
    pinned: value.pinned,
  };
}

function parseLink(value: unknown): PhysicsLink | null {
  if (
    !isRecord(value) ||
    typeof value.fromParticleId !== "string" ||
    typeof value.toParticleId !== "string" ||
    !isFiniteNumber(value.restLength) ||
    !isFiniteNumber(value.stiffness)
  )
    return null;
  return {
    fromParticleId: value.fromParticleId,
    toParticleId: value.toParticleId,
    restLength: value.restLength,
    stiffness: value.stiffness,
  };
}

function parseOutput(value: unknown): PhysicsOutput | null {
  if (
    !isRecord(value) ||
    (value.type !== "rotation" && value.type !== "translation") ||
    typeof value.boneId !== "string" ||
    typeof value.particleId !== "string" ||
    !isFiniteNumber(value.mix)
  )
    return null;
  const shared = {
    boneId: value.boneId as BoneId,
    mix: value.mix,
    particleId: value.particleId,
    ...(typeof value.rootParticleId === "string"
      ? { rootParticleId: value.rootParticleId }
      : {}),
  };
  return value.type === "rotation"
    ? { type: "rotation", ...shared }
    : { type: "translation", ...shared };
}

function parseVector(value: unknown): Vector2 | null {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
    ? { x: value.x, y: value.y }
    : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
