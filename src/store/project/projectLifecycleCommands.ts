import { produce } from "immer";

import { createEmptyProject } from "@/core/createEmptyProject";

import { clearHistory } from "@/store/undoHistory";

import { notifyProjectChanged } from "@/domain/animationLifecycle.js";

import { prepareLoadedProjectState } from "./projectStoreShared.js";

import type {
  ProjectActions,
  ProjectStore,
  ProjectStoreGet,
  ProjectStoreSet,
} from "./projectStoreTypes.types.js";

type ProjectLifecycleCommands = Pick<
  ProjectActions,
  | "resetProject"
  | "commitLoadedProject"
  | "loadProject"
  | "updateCanvas"
  | "restoreProject"
>;

export function createProjectLifecycleCommands(
  set: ProjectStoreSet,
  get: ProjectStoreGet,
): ProjectLifecycleCommands {
  return {
    resetProject: () => {
      clearHistory();
      return set(
        produce<ProjectStore>((state) => {
          const empty = createEmptyProject();
          state.project.author = empty.author;
          state.project.lastActiveAnimationId = empty.lastActiveAnimationId;
          state.project.canvas = empty.canvas;
          state.project.textures = empty.textures;
          state.project.nodes = empty.nodes;
          state.project.bones = empty.bones;
          state.project.slots = empty.slots;
          state.project.attachments = empty.attachments;
          state.project.skins = empty.skins;
          state.project.constraints = empty.constraints;
          state.project.defaultPose = empty.defaultPose;
          state.project.physics_groups = empty.physics_groups;
          state.project.physicsRules = empty.physicsRules;
          state.project.libraryFolders = empty.libraryFolders;
          state.project.assetPlacements = empty.assetPlacements;
          state.project.controlHandles = empty.controlHandles;
          state.project.animationModifiers = empty.animationModifiers;
          state.project.animations = empty.animations;
          state.project.version = empty.version;
          state.versionControl.geometryVersion++;
          state.versionControl.transformVersion++;
          state.versionControl.textureVersion++;
          state.hasUnsavedChanges = false;
        }),
      );
    },

    commitLoadedProject: (preparedState) => {
      clearHistory();
      set(
        produce<ProjectStore>((state) => {
          state.project = preparedState.project;
          state.versionControl.geometryVersion++;
          state.versionControl.transformVersion++;
          state.versionControl.textureVersion++;
          state.hasUnsavedChanges = false;
        }),
      );
      notifyProjectChanged();
    },

    loadProject: (projectData) => {
      get().commitLoadedProject(prepareLoadedProjectState(projectData));
    },

    updateCanvas: (partial) =>
      set(
        produce<ProjectStore>((state) => {
          state.hasUnsavedChanges = true;
          Object.assign(state.project.canvas, partial);
        }),
      ),

    restoreProject: (restoredState) => {
      set(() => ({
        ...restoredState,
        versionControl: {
          ...restoredState.versionControl,
          geometryVersion:
            (restoredState.versionControl?.geometryVersion ?? 0) + 1,
          transformVersion:
            (restoredState.versionControl?.transformVersion ?? 0) + 1,
          textureVersion:
            (restoredState.versionControl?.textureVersion ?? 0) + 1,
        },
      }));
      notifyProjectChanged();
    },
  };
}
