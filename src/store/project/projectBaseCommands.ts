import { produceWithPatches } from "immer";

import { ensureRigCollections } from "@/store/project/projectStoreShared.js";
import type {
  ProjectActions,
  ProjectStoreSet,
} from "@/store/project/projectStoreTypes.types.js";
import { pushPatches } from "@/store/undoHistory";

type ProjectBaseCommands = Pick<
  ProjectActions,
  "updateProject" | "setHasUnsavedChanges"
>;

export function createProjectBaseCommands(
  set: ProjectStoreSet,
): ProjectBaseCommands {
  return {
    updateProject: (recipe, { skipHistory = false } = {}) =>
      set((state) => {
        let hasUnsavedChanges = state.hasUnsavedChanges;
        if (!skipHistory) {
          hasUnsavedChanges = true;
        }
        const [nextState, patches, inversePatches] = produceWithPatches(
          state,
          (draft) => {
            draft.hasUnsavedChanges = hasUnsavedChanges;
            ensureRigCollections(draft.project);
            recipe(draft.project, draft.versionControl);
            ensureRigCollections(draft.project);
          },
        );
        if (!skipHistory && patches.length > 0) {
          pushPatches(patches, inversePatches);
        }
        return nextState;
      }),

    setHasUnsavedChanges: (val) => set({ hasUnsavedChanges: val }),
  };
}
