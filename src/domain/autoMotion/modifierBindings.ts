import type {
  AnimationModifier,
  ModifierBinding,
  ProjectDocument,
} from "@kukla2d/contracts";

import { findHandleByRole } from "./controlHandles.js";
import { getPresetRoles } from "./presetRegistry.js";

interface BindingWarning {
  code: "MISSING_BINDING" | "UNRESOLVED_BINDING";
  role: string;
  message: string;
}

export function resolveBindingTarget({
  project,
  binding,
}: {
  project: ProjectDocument;
  binding: ModifierBinding | null | undefined;
  modifier?: AnimationModifier;
}): { kind: "project" | "part" | "bone" | "warpDeformer"; id: string } | null {
  if (!binding?.role) return null;
  switch (binding.target) {
    case "handle": {
      const handle = findHandleByRole(project, binding.role);
      if (!handle) return null;
      return handle.target;
    }
    case "part":
    case "bone":
    case "warpDeformer":
      return { kind: binding.target, id: binding.role };
    default:
      return null;
  }
}

export function validateBindings({
  project,
  modifier,
}: {
  project: ProjectDocument;
  modifier: AnimationModifier | null | undefined;
}): BindingWarning[] {
  if (!modifier) return [];
  const roles = getPresetRoles(modifier.presetId);
  if (!roles) return [];

  const warnings: BindingWarning[] = [];
  for (const [roleKey, roleDef] of Object.entries(roles)) {
    if (!roleDef.required) continue;
    const binding = modifier?.bindings?.[roleKey];
    if (!binding) {
      warnings.push({
        code: "MISSING_BINDING",
        role: roleKey,
        message: `Required binding "${roleKey}" is missing`,
      });
      continue;
    }
    const resolved = resolveBindingTarget({ project, binding, modifier });
    if (!resolved) {
      warnings.push({
        code: "UNRESOLVED_BINDING",
        role: roleKey,
        message: `Binding "${roleKey}" could not be resolved`,
      });
    }
  }
  return warnings;
}

export function getUnmetRequiredRoles({
  project,
  modifier,
}: {
  project: ProjectDocument;
  modifier: AnimationModifier | null | undefined;
}): string[] {
  if (!modifier) return [];
  const roles = getPresetRoles(modifier.presetId);
  if (!roles) return [];

  const unmet: string[] = [];
  for (const [roleKey, roleDef] of Object.entries(roles)) {
    if (!roleDef.required) continue;
    const binding = modifier?.bindings?.[roleKey];
    if (!binding) {
      unmet.push(roleKey);
      continue;
    }
    const resolved = resolveBindingTarget({ project, binding, modifier });
    if (!resolved) {
      unmet.push(roleKey);
    }
  }
  return unmet;
}
