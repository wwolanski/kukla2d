import type { ProjectDocument } from "@kukla2d/contracts";

interface ProjectChangeSet {
  deletedNodes?: ReadonlySet<string>;
  deletedBones?: ReadonlySet<string>;
  deletedBlendShapes?: ReadonlySet<string>;
}

interface AffectedModifiers {
  modifierIds: string[];
  handleIds: string[];
  warnings: string[];
}

export function findModifiersAffectedByProjectChange(
  project: ProjectDocument,
  change: ProjectChangeSet,
): AffectedModifiers {
  const modifiers = project.animationModifiers ?? [];
  const handles = project.controlHandles ?? [];
  const result: AffectedModifiers = {
    modifierIds: [],
    handleIds: [],
    warnings: [],
  };

  for (const mod of modifiers) {
    if (mod.enabled === false) continue;

    for (const output of mod.outputs ?? []) {
      if (change.deletedNodes?.has(output.targetId)) {
        result.modifierIds.push(mod.id);
        result.warnings.push(
          `Modifier "${mod.id}" output target node "${output.targetId}" deleted`,
        );
        break;
      }
      if (change.deletedBlendShapes?.has(output.property)) {
        const targetNode = (project.nodes ?? []).find(
          (n) => n.id === output.targetId,
        );
        if (targetNode && change.deletedNodes?.has(targetNode.id)) continue;
        result.modifierIds.push(mod.id);
        result.warnings.push(
          `Modifier "${mod.id}" references deleted blendShape "${output.property}"`,
        );
        break;
      }
    }

    if (
      change.deletedBones?.size &&
      mod.driver?.kind === "boneMotion" &&
      mod.driver.sourceBoneId != null
    ) {
      if (change.deletedBones.has(mod.driver.sourceBoneId)) {
        result.modifierIds.push(mod.id);
        result.warnings.push(
          `Modifier "${mod.id}" references deleted source bone "${mod.driver.sourceBoneId}"`,
        );
      }
    }
  }

  for (const handle of handles) {
    if (change.deletedNodes?.has(handle.target.id)) {
      result.handleIds.push(handle.id);
    }
  }

  result.modifierIds = [...new Set(result.modifierIds)];
  result.handleIds = [...new Set(result.handleIds)];
  return result;
}
