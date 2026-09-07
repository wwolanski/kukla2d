import { produceWithPatches, type Draft } from "immer";

import type { ProjectDocument, Transform } from "@kukla2d/contracts";

import { prepareLoadedProjectDocument } from "@/schema/projectDocumentAdapter";

import { pushPatches, transaction } from "@/store/undoHistory";

import type {
  AnimationDocumentCommand,
  ProjectCommandResult,
  ProjectStore,
} from "./projectStoreTypes.types.js";
import type { ValidatedProjectDocument } from "@/schema/projectSchema.types";

interface PreparedProjectState {
  project: ProjectDocument;
}

export function ensureRigCollections(
  project: Draft<ProjectDocument> | ProjectDocument,
): void {
  project.bones ??= [];
  project.slots ??= [];
  project.attachments ??= [];
  project.skins ??= [];
  project.constraints ??= [];
  project.defaultPose ??= {};
}

export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Float32Array) return new Float32Array(obj) as T;
  if (obj instanceof Uint16Array) return new Uint16Array(obj) as T;
  if (obj instanceof Uint32Array) return new Uint32Array(obj) as T;
  if (Array.isArray(obj)) return obj.map(deepClone) as T;
  const cloned: Record<string, unknown> = {};
  for (const key in obj as Record<string, unknown>) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone((obj as Record<string, unknown>)[key]);
    }
  }
  return cloned as T;
}

export function prepareLoadedProjectState(
  projectData: ProjectDocument | ValidatedProjectDocument,
): PreparedProjectState {
  const project = prepareLoadedProjectDocument(projectData);
  ensureRigCollections(project);
  return { project };
}

export const DEFAULT_TRANSFORM = (): Transform => ({
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  pivotX: 0,
  pivotY: 0,
});

export function executeAnimationDocumentCommand(
  state: ProjectStore,
  { name, type, command }: AnimationDocumentCommand,
): { nextState: ProjectStore; result: ProjectCommandResult } {
  let result: ProjectCommandResult = { changed: false, affectedIds: [] };
  const [nextState, patches, inversePatches] = produceWithPatches(
    state,
    (draft) => {
      ensureRigCollections(draft.project);
      result = command(draft.project);
      draft.hasUnsavedChanges = result.changed ? true : draft.hasUnsavedChanges;
      ensureRigCollections(draft.project);
    },
  );

  if (result.changed && patches.length > 0) {
    transaction(name, type, () => {
      pushPatches(patches, inversePatches);
    });
  }

  return { nextState, result };
}
