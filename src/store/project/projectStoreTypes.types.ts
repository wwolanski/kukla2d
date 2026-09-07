import type {
  AnimationModifier,
  AnimationId,
  Canvas,
  ControlHandle,
  PhysicsRule,
  ProjectDocument,
} from "@kukla2d/contracts";

import type {
  AddAnimationAudioTrackPayload,
  AddAnimationMarkerPayload,
  CreateAnimationClipPayload,
  DeleteAnimationKeyframesPayload,
  EditAnimationKeyframesPayload,
  MoveAnimationKeyframesPayload,
  RemoveAnimationAudioTrackPayload,
  SetAnimationKeyframeEasingPayload,
  SetAnimationTargetBoomerangPayload,
  UpdateAnimationAudioTrackPayload,
  UpdateAnimationTimingPayload,
  UpsertAnimationKeyframePayload,
  UpsertAnimationKeyframesPayload,
} from "@/domain/animationCommandTypes.types.js";

import type { ValidatedProjectDocument } from "@/schema/projectSchema.types";
import type { Draft } from "immer";
import type { StoreApi } from "zustand";

export interface ProjectVersionControl {
  geometryVersion: number;
  transformVersion: number;
  textureVersion: number;
}

interface ProjectState {
  project: ProjectDocument;
  versionControl: ProjectVersionControl;
  hasUnsavedChanges: boolean;
}

export type ProjectCommandResult =
  | { changed: true; affectedIds: string[] }
  | { changed: false; affectedIds: string[] };

type ProjectCommandErrorCode =
  "not-found" | "invalid-target" | "unsupported-driver" | "empty-result";

type ProjectOperationResult<
  T extends Record<string, unknown> = Record<never, never>,
> =
  | ({ changed: true } & T)
  | { changed: false; error: string; errorCode?: ProjectCommandErrorCode };

interface ProjectUpdateOptions {
  skipHistory?: boolean;
}

type ProjectRecipe = (
  project: Draft<ProjectDocument>,
  versionControl: Draft<ProjectVersionControl>,
) => void;

interface SelectionTargetIds {
  nodeIds?: string[];
  boneIds?: string[];
  constraintIds?: string[];
}

interface DeleteSelectionIntent {
  nodeIds: string[];
  boneIds: string[];
  constraintIds: string[];
  parts: string[];
  groups: string[];
  counts: {
    nodes: number;
    bones: number;
    constraints: number;
    parts: number;
    groups: number;
  };
  label: string;
  isEmpty: boolean;
  hasMixedTargets: boolean;
}

interface AutoMotionOptions {
  [option: string]: unknown;
}

interface IdleBreathingMotionPayload {
  chestNodeId: string;
  options?: AutoMotionOptions;
}

interface HeadCheekJiggleMotionPayload {
  sourceBoneId: string;
  faceNodeId: string;
  options?: AutoMotionOptions;
}

interface BakeAnimationModifierPayload {
  modifierId: string;
  animationId: AnimationId;
  mode?: "disable-after-bake" | "keep-enabled";
}

export interface ProjectActions {
  updateProject: (
    recipe: ProjectRecipe,
    options?: ProjectUpdateOptions,
  ) => void;
  setHasUnsavedChanges: (value: boolean) => void;
  resetProject: () => void;
  commitLoadedProject: (preparedState: { project: ProjectDocument }) => void;
  loadProject: (
    projectData: ProjectDocument | ValidatedProjectDocument,
  ) => void;
  updateCanvas: (partial: Partial<Canvas>) => void;
  restoreProject: (restoredState: ProjectStore) => void;

  createWarpDeformer: (name?: string) => void;
  createGroup: (name?: string) => void;
  reparentNode: (nodeId: string, newParentId?: string | null) => void;
  duplicateNode: (nodeId: string) => void;
  deleteNode: (nodeId: string) => void;
  deleteSelectedNodes: (nodeIds: string[]) => void;
  deleteSelectedBones: (boneIds: string[]) => void;
  deleteSelectedConstraints: (constraintIds: string[]) => void;
  deleteSelection: (selection?: SelectionTargetIds) => void;
  buildDeleteSelectionIntent: (
    selection: SelectionTargetIds,
  ) => DeleteSelectionIntent;

  createAnimationClip: (
    payload?: CreateAnimationClipPayload,
  ) => ProjectCommandResult;
  renameAnimationClip: (
    animationId: AnimationId,
    newName: string,
  ) => ProjectCommandResult;
  deleteAnimationClip: (animationId: AnimationId) => ProjectCommandResult;
  updateAnimationTiming: (
    payload: UpdateAnimationTimingPayload,
  ) => ProjectCommandResult;
  upsertAnimationKeyframe: (
    payload: UpsertAnimationKeyframePayload,
  ) => ProjectCommandResult;
  upsertAnimationKeyframes: (
    payload: UpsertAnimationKeyframesPayload,
  ) => ProjectCommandResult;
  editAnimationKeyframes: (
    payload: EditAnimationKeyframesPayload,
  ) => ProjectCommandResult;
  moveAnimationKeyframes: (
    payload: MoveAnimationKeyframesPayload,
  ) => ProjectCommandResult;
  deleteAnimationKeyframes: (
    payload: DeleteAnimationKeyframesPayload,
  ) => ProjectCommandResult;
  setAnimationKeyframeEasing: (
    payload: SetAnimationKeyframeEasingPayload,
  ) => ProjectCommandResult;
  addAnimationMarker: (
    payload: AddAnimationMarkerPayload,
  ) => ProjectCommandResult;
  addAnimationAudioTrack: (
    payload: AddAnimationAudioTrackPayload,
  ) => ProjectCommandResult;
  updateAnimationAudioTrack: (
    payload: UpdateAnimationAudioTrackPayload,
  ) => ProjectCommandResult;
  removeAnimationAudioTrack: (
    payload: RemoveAnimationAudioTrackPayload,
  ) => ProjectCommandResult;
  setAnimationTargetBoomerang: (
    payload: SetAnimationTargetBoomerangPayload,
  ) => ProjectCommandResult;
  createAnimation: (name?: string) => string | null;
  renameAnimation: (id: string, newName: string) => ProjectCommandResult;
  deleteAnimation: (id: string) => ProjectCommandResult;

  createBlendShape: (nodeId: string, name?: string) => void;
  deleteBlendShape: (nodeId: string, shapeId: string) => void;
  setBlendShapeValue: (nodeId: string, shapeId: string, value: number) => void;
  updateBlendShapeDeltas: (
    nodeId: string,
    shapeId: string,
    deltas: Array<{ dx: number; dy: number }>,
  ) => void;

  setPhysicsRules: (rules: PhysicsRule[]) => void;
  createPhysicsRule: (rule: PhysicsRule) => void;
  updatePhysicsRule: (id: string, partial: Partial<PhysicsRule>) => void;
  deletePhysicsRule: (id: string) => void;
  reorderPhysicsRules: (orderedIds: string[]) => void;

  createControlHandle: (handle: ControlHandle) => void;
  updateControlHandle: (id: string, patch: Partial<ControlHandle>) => void;
  deleteControlHandle: (id: string) => void;
  createAnimationModifier: (modifier: AnimationModifier) => void;
  updateAnimationModifier: (
    id: string,
    patch: Partial<AnimationModifier>,
  ) => void;
  deleteAnimationModifier: (
    id: string,
    options?: Record<string, unknown>,
  ) => void;
  reorderAnimationModifiers: (ids: string[]) => void;
  duplicateAnimationModifier: (id: string) => void;
  createIdleBreathingMotion: (
    payload: IdleBreathingMotionPayload,
  ) => ProjectOperationResult;
  createHeadCheekJiggleMotion: (
    payload: HeadCheekJiggleMotionPayload,
  ) => ProjectOperationResult;
  bakeAnimationModifierToKeyframes: (
    payload: BakeAnimationModifierPayload,
  ) => ProjectOperationResult<{ count: number }>;
}

export type ProjectStore = ProjectState & ProjectActions;
export type ProjectStoreSet = StoreApi<ProjectStore>["setState"];
export type ProjectStoreGet = StoreApi<ProjectStore>["getState"];

export interface AnimationDocumentCommand {
  name: string;
  type: string;
  command: (project: Draft<ProjectDocument>) => ProjectCommandResult;
}
