import type { ProjectStore } from "@/store/project/projectStoreTypes.types.js";
import { transaction } from "@/store/undoHistory";

import type {
  ModularSpriteCommitRequest,
  ModularSpriteCommitResult,
} from "@/features/modular-sprite";

type ProjectUpdate = ProjectStore["updateProject"];
type ProjectRecipe = Parameters<ProjectUpdate>[0];

/**
 * Groups the synchronous project commit and generator cleanup into one undo
 * entry. The commit API remains Promise-based, so its result is awaited after
 * the synchronous transaction has flushed its patches.
 */
export async function commitGeneratedPackage(
  request: ModularSpriteCommitRequest,
  commit: (request: ModularSpriteCommitRequest) => Promise<ModularSpriteCommitResult>,
  updateProject: ProjectUpdate,
  cleanup: ProjectRecipe,
): Promise<ModularSpriteCommitResult> {
  let commitPromise: Promise<ModularSpriteCommitResult> | undefined;
  transaction("Regenerate modular sprite", "import", () => {
    commitPromise = commit(request);
    updateProject(cleanup);
  });

  if (!commitPromise)
    throw new Error("The modular sprite commit did not return a Promise");
  const result = await commitPromise;
  return result;
}
