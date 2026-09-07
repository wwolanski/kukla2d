import type {
  Bone,
  BoneId,
  PhysicsRule,
  ProjectDocument,
} from "@kukla2d/contracts";

import type { PoseOverrides } from "@/domain/animationEngine.types.js";

import { mapPhysicsRulesToRig } from "./mapper.js";
import { validatePhysicsRig } from "./physicsRig.js";
import {
  evaluatePhysicsOutputs,
  resetPhysics,
  stepPhysicsResult,
} from "./solver.js";

import type {
  PhysicsOutput,
  PhysicsRig,
  PhysicsRigDiagnostic,
} from "./physicsRig.types.js";

interface ManualPosePhysicsArgs {
  project: Pick<ProjectDocument, "bones" | "physics_groups" | "physicsRules">;
  effectiveBones: readonly Bone[];
  timestamp: number;
  enabled: boolean;
}

type ManualPosePhysicsResult =
  | {
      state: "disabled";
      active: false;
      overrides: null;
      diagnostics: readonly [];
    }
  | {
      state: "inactive";
      active: false;
      overrides: null;
      diagnostics: readonly PhysicsRigDiagnostic[];
    }
  | {
      state: "active";
      active: true;
      overrides: PoseOverrides;
      diagnostics: readonly PhysicsRigDiagnostic[];
    }
  | {
      state: "disposed";
      active: false;
      overrides: null;
      diagnostics: readonly [];
    };

interface ManualPoseFrame {
  effectiveBones: readonly Bone[];
  poseOverrides: PoseOverrides | null;
}

interface ManualPosePhysicsRuntime {
  readonly disposed: boolean;
  evaluate(args: ManualPosePhysicsArgs): ManualPosePhysicsResult;
  applyToFrame<T extends ManualPoseFrame>(args: {
    baseFrame: T;
    project: ManualPosePhysicsArgs["project"];
    editor: { activeTool?: string };
    timestamp: number;
  }): T & { physicsActive: boolean; poseOverrides: PoseOverrides | null };
  reset(): void;
  dispose(): void;
}

interface RigBuildResult {
  rigs: PhysicsRig[];
  diagnostics: PhysicsRigDiagnostic[];
}

export function evaluateManualPosePhysics(
  args: ManualPosePhysicsArgs,
): ManualPosePhysicsResult {
  if (!args.enabled) return disabledResult();
  const build = buildRigsFromProject(args.project);
  if (build.rigs.length === 0) return inactiveResult(build.diagnostics);
  const boneMap = new Map<BoneId, Bone>(
    args.effectiveBones.map((bone) => [bone.id, bone]),
  );
  for (const rig of build.rigs) initializeAnchors(rig, boneMap);
  const evaluation = evaluateRigs(build.rigs, boneMap, 1 / 60);
  return {
    state: "active",
    active: true,
    overrides: evaluation.overrides,
    diagnostics: [...build.diagnostics, ...evaluation.diagnostics],
  };
}

export function createManualPosePhysicsRuntime(): ManualPosePhysicsRuntime {
  let physicsGroupsRef: readonly unknown[] | null = null;
  let physicsRulesRef: readonly PhysicsRule[] | null = null;
  let bonesRef: readonly Bone[] | null = null;
  let rigs: PhysicsRig[] = [];
  let buildDiagnostics: PhysicsRigDiagnostic[] = [];
  let lastTimestamp: number | null = null;
  let isDisposed = false;

  function rebuild(
    project: ManualPosePhysicsArgs["project"],
    effectiveBones: readonly Bone[],
  ): void {
    physicsGroupsRef = project.physics_groups;
    physicsRulesRef = project.physicsRules;
    bonesRef = project.bones;
    const build = buildRigsFromProject(project);
    rigs = build.rigs;
    buildDiagnostics = build.diagnostics;
    const boneMap = new Map<BoneId, Bone>(
      effectiveBones.map((bone) => [bone.id, bone]),
    );
    for (const rig of rigs) initializeAnchors(rig, boneMap);
    lastTimestamp = null;
  }

  function reset(): void {
    physicsGroupsRef = null;
    physicsRulesRef = null;
    bonesRef = null;
    rigs = [];
    buildDiagnostics = [];
    lastTimestamp = null;
  }

  const runtime: ManualPosePhysicsRuntime = {
    get disposed() {
      return isDisposed;
    },
    evaluate(args): ManualPosePhysicsResult {
      if (isDisposed)
        return {
          state: "disposed",
          active: false,
          overrides: null,
          diagnostics: [],
        };
      if (!args.enabled) {
        lastTimestamp = null;
        return disabledResult();
      }
      if (
        physicsGroupsRef !== args.project.physics_groups ||
        physicsRulesRef !== args.project.physicsRules ||
        bonesRef !== args.project.bones
      ) {
        rebuild(args.project, args.effectiveBones);
      }
      if (rigs.length === 0) return inactiveResult(buildDiagnostics);
      const boneMap = new Map<BoneId, Bone>(
        args.effectiveBones.map((bone) => [bone.id, bone]),
      );
      const deltaSeconds =
        lastTimestamp === null
          ? 1 / 60
          : (args.timestamp - lastTimestamp) / 1000;
      lastTimestamp = args.timestamp;
      const evaluation = evaluateRigs(rigs, boneMap, deltaSeconds);
      return {
        state: "active",
        active: true,
        overrides: evaluation.overrides,
        diagnostics: [...buildDiagnostics, ...evaluation.diagnostics],
      };
    },
    applyToFrame<T extends ManualPoseFrame>({
      baseFrame,
      project,
      editor,
      timestamp,
    }: {
      baseFrame: T;
      project: ManualPosePhysicsArgs["project"];
      editor: { activeTool?: string };
      timestamp: number;
    }): T & { physicsActive: boolean; poseOverrides: PoseOverrides | null } {
      const result = runtime.evaluate({
        project,
        effectiveBones: baseFrame.effectiveBones,
        timestamp,
        enabled: editor.activeTool === "pose",
      });
      return {
        ...baseFrame,
        poseOverrides: mergeOverrides(
          baseFrame.poseOverrides,
          result.overrides,
        ),
        physicsActive: result.active,
      };
    },
    reset,
    dispose(): void {
      if (isDisposed) return;
      reset();
      isDisposed = true;
    },
  };
  return runtime;
}

function buildRigsFromProject(
  project: ManualPosePhysicsArgs["project"],
): RigBuildResult {
  const rigs: PhysicsRig[] = [];
  const diagnostics: PhysicsRigDiagnostic[] = [];
  for (const group of project.physics_groups) {
    const validation = validatePhysicsRig(group);
    if (validation.ok) rigs.push(cloneRig(validation.rig));
    else diagnostics.push(...validation.diagnostics);
  }
  if (rigs.length === 0) {
    const enabledRules = project.physicsRules.filter(
      (rule) => rule.enabled !== false && typeof rule.boneId === "string",
    );
    if (enabledRules.length > 0) {
      const mapped = mapPhysicsRulesToRig(enabledRules, project.bones).rig;
      const validation = validatePhysicsRig(mapped);
      if (validation.ok) rigs.push(validation.rig);
      else diagnostics.push(...validation.diagnostics);
    }
  }
  return { rigs, diagnostics };
}

function cloneRig(rig: PhysicsRig): PhysicsRig {
  return {
    ...rig,
    particles: rig.particles.map((particle) => ({ ...particle })),
    links: rig.links.map((link) => ({ ...link })),
    outputs: rig.outputs.map((output) => ({ ...output })),
    gravity: { ...rig.gravity },
    wind: { ...rig.wind },
    tags: [...rig.tags],
  };
}

function initializeAnchors(
  rig: PhysicsRig,
  boneMap: ReadonlyMap<BoneId, Bone>,
): void {
  const initializedRoots = new Set<string>();
  for (const output of rig.outputs) {
    const bone = boneMap.get(output.boneId);
    const root = findRoot(rig, output);
    if (!bone || !root || initializedRoots.has(root.id)) continue;
    const deltaX = bone.setup.x - root.x;
    const deltaY = bone.setup.y - root.y;
    const chainIds = chainParticleIds(rig, output);
    for (const particle of rig.particles) {
      if (!chainIds.has(particle.id)) continue;
      particle.x += deltaX;
      particle.y += deltaY;
      particle.prevX += deltaX;
      particle.prevY += deltaY;
    }
    initializedRoots.add(root.id);
  }
  resetPhysics(rig);
}

function updateAnchors(
  rig: PhysicsRig,
  boneMap: ReadonlyMap<BoneId, Bone>,
): void {
  for (const output of rig.outputs) {
    const bone = boneMap.get(output.boneId);
    const root = findRoot(rig, output);
    if (!bone || !root) continue;
    root.x = bone.setup.x;
    root.y = bone.setup.y;
  }
}

function evaluateRigs(
  rigs: readonly PhysicsRig[],
  boneMap: ReadonlyMap<BoneId, Bone>,
  deltaSeconds: number,
): { overrides: PoseOverrides; diagnostics: PhysicsRigDiagnostic[] } {
  const overrides: PoseOverrides = new Map();
  const diagnostics: PhysicsRigDiagnostic[] = [];
  for (const rig of rigs) {
    updateAnchors(rig, boneMap);
    const step = stepPhysicsResult(rig, deltaSeconds, null);
    if (!step.ok) {
      diagnostics.push(...step.diagnostics);
      continue;
    }
    for (const [boneId, partial] of evaluatePhysicsOutputs(rig)) {
      const bone = boneMap.get(boneId);
      if (!bone) continue;
      const existing = overrides.get(boneId) ?? {};
      overrides.set(boneId, {
        ...existing,
        ...(partial.rotation === undefined
          ? {}
          : { rotation: bone.setup.rotation + partial.rotation }),
        ...(partial.x === undefined ? {} : { x: bone.setup.x + partial.x }),
        ...(partial.y === undefined ? {} : { y: bone.setup.y + partial.y }),
      });
    }
  }
  return { overrides, diagnostics };
}

function chainParticleIds(rig: PhysicsRig, output: PhysicsOutput): Set<string> {
  if (!output.rootParticleId)
    return new Set(rig.particles.map((particle) => particle.id));
  const prefix = output.rootParticleId.replace(/p0$/, "");
  return new Set(
    rig.particles
      .filter((particle) => particle.id.startsWith(prefix))
      .map((particle) => particle.id),
  );
}

function findRoot(
  rig: PhysicsRig,
  output: PhysicsOutput,
): PhysicsRig["particles"][number] | undefined {
  return (
    (output.rootParticleId
      ? rig.particles.find((particle) => particle.id === output.rootParticleId)
      : undefined) ?? rig.particles.find((particle) => particle.pinned)
  );
}

function mergeOverrides(
  base: PoseOverrides | null,
  extra: PoseOverrides | null,
): PoseOverrides | null {
  if (!extra?.size) return base;
  if (!base?.size) return new Map(extra);
  const merged: PoseOverrides = new Map(base);
  for (const [key, value] of extra) {
    const existing = merged.get(key);
    merged.set(key, existing ? { ...existing, ...value } : value);
  }
  return merged;
}

function disabledResult(): ManualPosePhysicsResult {
  return { state: "disabled", active: false, overrides: null, diagnostics: [] };
}

function inactiveResult(
  diagnostics: readonly PhysicsRigDiagnostic[],
): ManualPosePhysicsResult {
  return { state: "inactive", active: false, overrides: null, diagnostics };
}
