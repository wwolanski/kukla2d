import {
  ANIMATION_DEFAULTS,
  normalizeAnimationSettings,
} from "@/domain/animationDefaults.js";
import type { AnimationSettings } from "@/domain/animationDefaults.types.js";

type AnimationSettingsWriteResult =
  | { ok: true }
  | {
      ok: false;
      code: "STORAGE_UNAVAILABLE" | "WRITE_FAILED" | "RESET_FAILED";
      error: string;
    };

const STORAGE_KEY = "kukla2d.animation-settings.v1";
const SETTINGS_VERSION = 1;

export function safeGlobalStorage(): Storage | null {
  if (typeof globalThis.window === "undefined") return null;
  try {
    return globalThis.window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadAnimationSettings(
  storage: Storage | null = safeGlobalStorage(),
): AnimationSettings {
  if (!storage) return { ...ANIMATION_DEFAULTS };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...ANIMATION_DEFAULTS };
    const parsed: unknown = JSON.parse(raw);
    if (!isCurrentSettingsPayload(parsed)) return { ...ANIMATION_DEFAULTS };
    return normalizeAnimationSettings(parsed);
  } catch {
    return { ...ANIMATION_DEFAULTS };
  }
}

export function saveAnimationSettings(
  settings: unknown,
  storage: Storage | null = safeGlobalStorage(),
): AnimationSettingsWriteResult {
  if (!storage)
    return {
      ok: false,
      code: "STORAGE_UNAVAILABLE",
      error: "Storage unavailable",
    };
  const normalized = normalizeAnimationSettings(settings);
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SETTINGS_VERSION, ...normalized }),
    );
    return { ok: true };
  } catch (error: unknown) {
    return {
      ok: false,
      code: "WRITE_FAILED",
      error: errorMessage(error, "Save failed"),
    };
  }
}

export function resetAnimationSettings(
  storage: Storage | null = safeGlobalStorage(),
): AnimationSettingsWriteResult {
  if (!storage)
    return {
      ok: false,
      code: "STORAGE_UNAVAILABLE",
      error: "Storage unavailable",
    };
  try {
    storage.removeItem(STORAGE_KEY);
    return { ok: true };
  } catch (error: unknown) {
    return {
      ok: false,
      code: "RESET_FAILED",
      error: errorMessage(error, "Reset failed"),
    };
  }
}

function isCurrentSettingsPayload(
  value: unknown,
): value is Record<string, unknown> & { version: 1 } {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === SETTINGS_VERSION
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
