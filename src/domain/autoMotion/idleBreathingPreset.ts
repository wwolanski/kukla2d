export const IDLE_BREATHING_PRESET_ID = "builtin.idleBreathing";
export const IDLE_BREATHING_PRESET_VERSION = 1;
import type { MotionPresetDefinition } from "./autoMotionTypes.types.js";

export function createIdleBreathingPresetDefinition(): MotionPresetDefinition {
  return {
    presetId: IDLE_BREATHING_PRESET_ID,
    presetVersion: IDLE_BREATHING_PRESET_VERSION,
    name: "Idle Breathing",
    description: "Subtle breathing motion for idle animations",
    category: "loop",
    defaultDriver: {
      kind: "time",
      periodMs: 2400,
      phase: 0,
      curve: "easeInOutSine",
    },
    roles: {
      chest: {
        role: "chest",
        required: true,
        target: "part",
        weight: 1,
        note: "Primary chest/torso part",
      },
      head: {
        role: "head",
        required: false,
        target: "part",
        weight: 0.3,
        note: "Head follow motion",
      },
      neck: {
        role: "neck",
        required: false,
        target: "part",
        weight: 0.5,
        note: "Neck follow motion",
      },
      belly: {
        role: "belly",
        required: false,
        target: "part",
        weight: 0.6,
        note: "Belly counter-motion",
      },
      leftArm: {
        role: "leftArm",
        required: false,
        target: "part",
        weight: 0.15,
        note: "Left arm follow",
      },
      rightArm: {
        role: "rightArm",
        required: false,
        target: "part",
        weight: 0.15,
        note: "Right arm follow",
      },
      leftLeg: {
        role: "leftLeg",
        required: false,
        target: "part",
        weight: 0.1,
        note: "Left leg follow",
      },
      rightLeg: {
        role: "rightLeg",
        required: false,
        target: "part",
        weight: 0.1,
        note: "Right leg follow",
      },
      tail: {
        role: "tail",
        required: false,
        target: "part",
        weight: 0.2,
        note: "Tail sway",
      },
    },
    defaultOutputs: [
      { kind: "blendShapeValue", targetId: "", property: "", blendMode: "add" },
    ],
    defaultParams: {
      strength: 1,
      chestExpandPx: 4,
      verticalLiftPx: 16,
      limbFollowPx: 1,
    },
  };
}
