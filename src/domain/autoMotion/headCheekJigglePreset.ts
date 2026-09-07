export const HEAD_CHEEK_JIGGLE_PRESET_ID = "builtin.headCheekJiggle";
export const HEAD_CHEEK_JIGGLE_PRESET_VERSION = 2;
import type { MotionPresetDefinition } from "./autoMotionTypes.types.js";

export function createHeadCheekJigglePresetDefinition(): MotionPresetDefinition {
  return {
    presetId: HEAD_CHEEK_JIGGLE_PRESET_ID,
    presetVersion: HEAD_CHEEK_JIGGLE_PRESET_VERSION,
    name: "Head Cheek Jiggle",
    description:
      "Subtle cheek jiggle driven by head bone motion, simulating inertia without a physics solver.",
    category: "reaction",
    defaultDriver: {
      kind: "boneMotion",
      axes: ["x", "y"],
      gain: 0.8,
      deadZone: 0.1,
      curve: "linear",
    },
    roles: {
      sourceBone: {
        role: "sourceBone",
        required: true,
        target: "bone",
        weight: 1,
        note: "Head bone that drives the jiggle",
      },
      facePart: {
        role: "facePart",
        required: true,
        target: "part",
        weight: 1,
        note: "Face/cheek part with mesh to deform",
      },
      cheekArea: {
        role: "cheekArea",
        required: true,
        target: "handle",
        weight: 1,
        note: "Approximate cheek region inside the face part",
      },
    },
    defaultOutputs: [
      { kind: "blendShapeValue", targetId: "", property: "", blendMode: "add" },
    ],
    defaultParams: {
      strength: 0.5,
      jigglePx: 3,
      softness: 0.3,
      cheekPointX: 0,
      cheekPointY: 0,
      cheekRadius: 0.35,
    },
  };
}
