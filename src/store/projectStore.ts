import { create } from "zustand";

import { createEmptyProject } from "@/core/createEmptyProject";

import { createProjectAnimationCommands } from "@/store/project/projectAnimationCommands.js";
import { createProjectBaseCommands } from "@/store/project/projectBaseCommands.js";
import { createProjectBlendShapeCommands } from "@/store/project/projectBlendShapeCommands.js";
import { composeProjectCapabilities } from "@/store/project/projectCapabilityCreators.js";
import { createProjectControlMotionCommands } from "@/store/project/projectControlMotionCommands.js";
import { createProjectLifecycleCommands } from "@/store/project/projectLifecycleCommands.js";
import { createProjectNodeHierarchyCommands } from "@/store/project/projectNodeHierarchyCommands.js";
import { createProjectPhysicsRuleCommands } from "@/store/project/projectPhysicsRuleCommands.js";
import type { ProjectStore } from "@/store/project/projectStoreTypes.types.js";

// Runtime document composition root. Capability creators preserve flat public API.
export const useProjectStore = create<ProjectStore>()((set, get) => ({
  project: createEmptyProject(),
  versionControl: {
    geometryVersion: 0,
    transformVersion: 0,
    textureVersion: 0,
  },
  hasUnsavedChanges: false,
  ...composeProjectCapabilities(
    createProjectBaseCommands(set),
    createProjectNodeHierarchyCommands(set, get),
    createProjectAnimationCommands(set, get),
    createProjectPhysicsRuleCommands(set),
    createProjectBlendShapeCommands(set),
    createProjectControlMotionCommands(set, get),
    createProjectLifecycleCommands(set, get),
  ),
}));
