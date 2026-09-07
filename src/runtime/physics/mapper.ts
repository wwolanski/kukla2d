import type { Bone, BoneId, PhysicsRule } from "@kukla2d/contracts";

import { isFiniteNumber } from "@/lib/math";

import { createPendulumChain } from "./physicsRig.js";

import type { PhysicsRig } from "./physicsRig.types.js";

interface PhysicsMappingResult {
  rig: PhysicsRig;
  warnings: readonly string[];
}

export function mapPhysicsRulesToRig(
  physicsRules: readonly PhysicsRule[],
  bones: readonly Bone[],
): PhysicsMappingResult {
  const warnings: string[] = [];
  const rig: PhysicsRig = {
    id: "mapped_rig",
    name: "Mapped from physicsRules",
    particles: [],
    links: [],
    outputs: [],
    gravity: { x: 0, y: -980 },
    wind: { x: 0, y: 0 },
    iterations: 8,
    tags: [],
  };

  for (const rule of physicsRules) {
    const boneId =
      typeof rule.boneId === "string" ? (rule.boneId as BoneId) : null;
    if (!boneId) {
      warnings.push(
        `Rule "${rule.id ?? rule.name ?? "unnamed"}": missing boneId, skipped`,
      );
      continue;
    }
    const bone = bones.find((candidate) => candidate.id === boneId);
    const segmentCount = finiteIntegerOr(rule.segments, 3);
    const tags = stringArrayOrEmpty(rule.tags);
    const chain = createPendulumChain(
      rule.id,
      rule.name ?? `Chain ${boneId}`,
      boneId,
      bone?.setup.length ?? 50,
      segmentCount,
      tags,
    );
    if (isFiniteNumber(rule.stiffness)) {
      for (const link of chain.links) link.stiffness = rule.stiffness;
    }
    if (isFiniteNumber(rule.damping)) {
      for (const particle of chain.particles) particle.damping = rule.damping;
    }
    rig.particles.push(...chain.particles);
    rig.links.push(...chain.links);
    rig.outputs.push(...chain.outputs);
    if (
      typeof rule.requireTag === "string" &&
      !tags.includes(rule.requireTag)
    ) {
      warnings.push(
        `Rule "${rule.id}": requireTag "${rule.requireTag}" not matched by tags [${tags.join(", ")}]`,
      );
    }
  }
  return { rig, warnings };
}

function stringArrayOrEmpty(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
function finiteIntegerOr(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? Math.max(1, Math.floor(value)) : fallback;
}
