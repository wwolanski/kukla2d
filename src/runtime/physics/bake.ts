import type { BoneId } from "@kukla2d/contracts";

import { evaluatePhysicsOutputs, resetPhysics, stepPhysics } from "./solver.js";

import type { PhysicsRig, Vector2 } from "./physicsRig.types.js";

interface PhysicsInputSample {
  time: number;
  input: Vector2;
}
interface BakedPhysicsKeyframe {
  time: number;
  value: number;
  easing: "linear";
}
interface BakedPhysicsTrack {
  boneId: BoneId;
  property: "x" | "y" | "rotation";
  keyframes: BakedPhysicsKeyframe[];
}

export function bakePhysicsToKeyframes(
  rig: PhysicsRig,
  durationSeconds: number,
  fps: number,
  inputs: readonly PhysicsInputSample[],
): BakedPhysicsTrack[] {
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 0 ||
    !Number.isFinite(fps) ||
    fps <= 0
  )
    return [];
  const frameDuration = 1 / fps;
  const totalFrames = Math.ceil(durationSeconds * fps);
  const tracks = new Map<string, BakedPhysicsTrack>();
  resetPhysics(rig);
  for (let frame = 0; frame <= totalFrames; frame += 1) {
    const timeSeconds = frame * frameDuration;
    const input = inputs.find(
      (sample) => Math.abs(sample.time - timeSeconds) < frameDuration * 0.5,
    )?.input ?? { x: 0, y: 0 };
    stepPhysics(rig, frameDuration, input);
    for (const [boneId, properties] of evaluatePhysicsOutputs(rig)) {
      for (const property of ["x", "y", "rotation"] as const) {
        const value = properties[property];
        if (value === undefined) continue;
        const key = `${boneId}:${property}`;
        const track = tracks.get(key) ?? { boneId, property, keyframes: [] };
        track.keyframes.push({
          time: timeSeconds * 1000,
          value,
          easing: "linear",
        });
        tracks.set(key, track);
      }
    }
  }
  return [...tracks.values()];
}
