import type { ModifierDriver, ModifierOutput } from "@kukla2d/contracts";

import { createHeadCheekJigglePresetDefinition } from "./headCheekJigglePreset.js";
import { createIdleBreathingPresetDefinition } from "./idleBreathingPreset.js";

import type {
  MotionPresetDefinition,
  MotionPresetRole,
} from "./autoMotionTypes.types.js";

const AUTO_MOTION_PRESETS = new Map<string, MotionPresetDefinition>();

export function registerPreset(definition: MotionPresetDefinition): void {
  AUTO_MOTION_PRESETS.set(definition.presetId, definition);
}

export function getMotionPreset(
  presetId: string,
): MotionPresetDefinition | null {
  return AUTO_MOTION_PRESETS.get(presetId) ?? null;
}

export function getAllPresets(): MotionPresetDefinition[] {
  return Array.from(AUTO_MOTION_PRESETS.values());
}

export function getPresetRoles(
  presetId: string,
): Record<string, MotionPresetRole> | null {
  const preset = getMotionPreset(presetId);
  return preset ? { ...preset.roles } : null;
}

export function getPresetDefaultDriver(
  presetId: string,
): ModifierDriver | null {
  const preset = getMotionPreset(presetId);
  return preset ? { ...preset.defaultDriver } : null;
}

export function getPresetDefaultParams(
  presetId: string,
): Record<string, number> | null {
  const preset = getMotionPreset(presetId);
  return preset ? { ...preset.defaultParams } : null;
}

export function getPresetDefaultOutputs(
  presetId: string,
): ModifierOutput[] | null {
  const preset = getMotionPreset(presetId);
  return preset ? preset.defaultOutputs.map((output) => ({ ...output })) : null;
}

registerPreset(createIdleBreathingPresetDefinition());
registerPreset(createHeadCheekJigglePresetDefinition());
