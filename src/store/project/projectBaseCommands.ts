import { produceWithPatches } from "immer";

import { pushPatches } from "@/store/undoHistory";

import { ensureRigCollections } from "./projectStoreShared.js";

import type {
  ProjectActions,
  ProjectStoreSet,
} from "./projectStoreTypes.types.js";

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
