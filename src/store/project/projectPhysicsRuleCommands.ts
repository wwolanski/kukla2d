import { produce } from "immer";

import type {
  ProjectActions,
  ProjectStore,
  ProjectStoreSet,
} from "./projectStoreTypes.types.js";

type ProjectPhysicsRuleCommands = Pick<
  ProjectActions,
  | "setPhysicsRules"
  | "createPhysicsRule"
  | "updatePhysicsRule"
  | "deletePhysicsRule"
  | "reorderPhysicsRules"
>;

export function createProjectPhysicsRuleCommands(
  set: ProjectStoreSet,
): ProjectPhysicsRuleCommands {
  return {
    setPhysicsRules: (rules) =>
      set(
        produce<ProjectStore>((state) => {
          state.hasUnsavedChanges = true;
          state.project.physicsRules = rules;
        }),
      ),

    createPhysicsRule: (rule) =>
      set(
        produce<ProjectStore>((state) => {
          state.hasUnsavedChanges = true;
          state.project.physicsRules.push(rule);
        }),
      ),

    updatePhysicsRule: (id, partial) =>
      set(
        produce<ProjectStore>((state) => {
          state.hasUnsavedChanges = true;
          const rule = state.project.physicsRules.find((r) => r.id === id);
          if (rule) Object.assign(rule, partial);
        }),
      ),

    deletePhysicsRule: (id) =>
      set(
        produce<ProjectStore>((state) => {
          state.hasUnsavedChanges = true;
          state.project.physicsRules = state.project.physicsRules.filter(
            (r) => r.id !== id,
          );
        }),
      ),

    reorderPhysicsRules: (orderedIds) =>
      set(
        produce<ProjectStore>((state) => {
          state.hasUnsavedChanges = true;
          const byId = new Map(
            state.project.physicsRules.map((r) => [r.id, r]),
          );
          state.project.physicsRules = orderedIds.flatMap((id) => {
            const rule = byId.get(id);
            return rule ? [rule] : [];
          });
        }),
      ),
  };
}
