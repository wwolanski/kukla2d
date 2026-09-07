import type { ProjectDocument } from "@kukla2d/contracts";

import type {
  ProjectStore,
  ProjectVersionControl,
} from "./projectStoreTypes.types.js";

export const projectSelectors = {
  project: (state: ProjectStore): ProjectDocument => state.project,
  hasUnsavedChanges: (state: ProjectStore): boolean => state.hasUnsavedChanges,
  versionControl: (state: ProjectStore): ProjectVersionControl =>
    state.versionControl,
  animations: (state: ProjectStore) => state.project.animations,
  nodes: (state: ProjectStore) => state.project.nodes,
} as const;
