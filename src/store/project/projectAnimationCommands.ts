import { toAnimationId, type ProjectDocument } from "@kukla2d/contracts";

import {
  createAnimationClip,
  deleteAnimationClip,
  renameAnimationClip,
  updateAnimationTiming,
} from "@/domain/animationClipCommands.js";
import { editKeyframeBatch } from "@/domain/animationKeyframeBatchCommands.js";
import {
  deleteAnimationKeyframes,
  moveAnimationKeyframes,
  setAnimationKeyframeEasing,
  upsertAnimationKeyframe,
  upsertAnimationKeyframes,
} from "@/domain/animationKeyframeCommands.js";
import {
  addAnimationAudioTrack,
  addAnimationMarker,
  removeAnimationAudioTrack,
  setAnimationTargetBoomerang,
  updateAnimationAudioTrack,
} from "@/domain/animationMetadataCommands.js";

import { executeAnimationDocumentCommand } from "./projectStoreShared.js";

import type {
  AnimationDocumentCommand,
  ProjectActions,
  ProjectCommandResult,
  ProjectStoreGet,
  ProjectStoreSet,
} from "./projectStoreTypes.types.js";
import type { Draft } from "immer";

type ProjectAnimationCommands = Pick<
  ProjectActions,
  | "createAnimationClip"
  | "renameAnimationClip"
  | "deleteAnimationClip"
  | "updateAnimationTiming"
  | "upsertAnimationKeyframe"
  | "upsertAnimationKeyframes"
  | "editAnimationKeyframes"
  | "moveAnimationKeyframes"
  | "deleteAnimationKeyframes"
  | "setAnimationKeyframeEasing"
  | "addAnimationMarker"
  | "addAnimationAudioTrack"
  | "updateAnimationAudioTrack"
  | "removeAnimationAudioTrack"
  | "setAnimationTargetBoomerang"
  | "createAnimation"
  | "renameAnimation"
  | "deleteAnimation"
>;

type ActionPayload<Action extends keyof ProjectActions> = Parameters<
  ProjectActions[Action]
>[0];
type AddAnimationAudioTrackPayload = ActionPayload<"addAnimationAudioTrack">;
type AddAnimationMarkerPayload = ActionPayload<"addAnimationMarker">;
type CreateAnimationClipPayload = NonNullable<
  ActionPayload<"createAnimationClip">
>;
type DeleteAnimationKeyframesPayload =
  ActionPayload<"deleteAnimationKeyframes">;
type EditAnimationKeyframesPayload = ActionPayload<"editAnimationKeyframes">;
type MoveAnimationKeyframesPayload = ActionPayload<"moveAnimationKeyframes">;
type RemoveAnimationAudioTrackPayload =
  ActionPayload<"removeAnimationAudioTrack">;
type SetAnimationKeyframeEasingPayload =
  ActionPayload<"setAnimationKeyframeEasing">;
type SetAnimationTargetBoomerangPayload =
  ActionPayload<"setAnimationTargetBoomerang">;
type UpdateAnimationAudioTrackPayload =
  ActionPayload<"updateAnimationAudioTrack">;
type UpdateAnimationTimingPayload = ActionPayload<"updateAnimationTiming">;
type UpsertAnimationKeyframePayload = ActionPayload<"upsertAnimationKeyframe">;
type UpsertAnimationKeyframesPayload =
  ActionPayload<"upsertAnimationKeyframes">;

type DomainCommand<Payload> = (
  project: Draft<ProjectDocument>,
  payload: Payload,
) => ProjectCommandResult;

/** Typed boundary for animation commands pending their phase-5 TS migration. */
function invokeDomainCommand<Payload>(
  command: unknown,
  project: Draft<ProjectDocument>,
  payload: Payload,
): ProjectCommandResult {
  return (command as DomainCommand<Payload>)(project, payload);
}

export function createProjectAnimationCommands(
  set: ProjectStoreSet,
  get: ProjectStoreGet,
): ProjectAnimationCommands {
  const exec = (
    name: string,
    type: string,
    command: AnimationDocumentCommand["command"],
  ): ProjectCommandResult => {
    const execution = executeAnimationDocumentCommand(get(), {
      name,
      type,
      command,
    });
    if (execution.result.changed) {
      set(() => execution.nextState);
    }
    return execution.result;
  };

  return {
    createAnimationClip: (payload = {}) =>
      exec("Create Animation Clip", "timeline", (draftProject) =>
        invokeDomainCommand<CreateAnimationClipPayload>(
          createAnimationClip,
          draftProject,
          payload,
        ),
      ),

    renameAnimationClip: (animationId, newName) =>
      exec("Rename Animation Clip", "timeline", (draftProject) =>
        invokeDomainCommand(renameAnimationClip, draftProject, {
          animationId,
          name: newName,
        }),
      ),

    deleteAnimationClip: (animationId) =>
      exec("Delete Animation Clip", "timeline", (draftProject) => {
        const result = invokeDomainCommand(deleteAnimationClip, draftProject, {
          animationId,
        });
        if (result.changed && draftProject.animationModifiers) {
          draftProject.animationModifiers =
            draftProject.animationModifiers.filter(
              (m) => m.scope !== "clip" || m.clipId !== animationId,
            );
        }
        return result;
      }),

    updateAnimationTiming: (payload) =>
      exec("Update Animation Timing", "timeline", (draftProject) =>
        invokeDomainCommand<UpdateAnimationTimingPayload>(
          updateAnimationTiming,
          draftProject,
          payload,
        ),
      ),

    upsertAnimationKeyframe: (payload) =>
      exec("Upsert Animation Keyframe", "timeline", (draftProject) =>
        invokeDomainCommand<UpsertAnimationKeyframePayload>(
          upsertAnimationKeyframe,
          draftProject,
          payload,
        ),
      ),

    upsertAnimationKeyframes: (payload) =>
      exec("Upsert Animation Keyframes", "timeline", (draftProject) =>
        invokeDomainCommand<UpsertAnimationKeyframesPayload>(
          upsertAnimationKeyframes,
          draftProject,
          payload,
        ),
      ),

    editAnimationKeyframes: (payload) =>
      exec("Edit Animation Keyframes", "timeline", (draftProject) =>
        invokeDomainCommand<EditAnimationKeyframesPayload>(
          editKeyframeBatch,
          draftProject,
          payload,
        ),
      ),

    moveAnimationKeyframes: (payload) =>
      exec("Move Animation Keyframes", "timeline", (draftProject) =>
        invokeDomainCommand<MoveAnimationKeyframesPayload>(
          moveAnimationKeyframes,
          draftProject,
          payload,
        ),
      ),

    deleteAnimationKeyframes: (payload) =>
      exec("Delete Animation Keyframes", "timeline", (draftProject) =>
        invokeDomainCommand<DeleteAnimationKeyframesPayload>(
          deleteAnimationKeyframes,
          draftProject,
          payload,
        ),
      ),

    setAnimationKeyframeEasing: (payload) =>
      exec("Set Animation Keyframe Easing", "timeline", (draftProject) =>
        invokeDomainCommand<SetAnimationKeyframeEasingPayload>(
          setAnimationKeyframeEasing,
          draftProject,
          payload,
        ),
      ),

    addAnimationMarker: (payload) =>
      exec("Add Animation Marker", "timeline", (draftProject) =>
        invokeDomainCommand<AddAnimationMarkerPayload>(
          addAnimationMarker,
          draftProject,
          payload,
        ),
      ),

    addAnimationAudioTrack: (payload) =>
      exec("Add Animation Audio Track", "timeline", (draftProject) =>
        invokeDomainCommand<AddAnimationAudioTrackPayload>(
          addAnimationAudioTrack,
          draftProject,
          payload,
        ),
      ),

    updateAnimationAudioTrack: (payload) =>
      exec("Update Animation Audio Track", "timeline", (draftProject) =>
        invokeDomainCommand<UpdateAnimationAudioTrackPayload>(
          updateAnimationAudioTrack,
          draftProject,
          payload,
        ),
      ),

    removeAnimationAudioTrack: (payload) =>
      exec("Remove Animation Audio Track", "timeline", (draftProject) =>
        invokeDomainCommand<RemoveAnimationAudioTrackPayload>(
          removeAnimationAudioTrack,
          draftProject,
          payload,
        ),
      ),

    setAnimationTargetBoomerang: (payload) =>
      exec("Set Target BOOMERANG", "timeline", (draftProject) =>
        invokeDomainCommand<SetAnimationTargetBoomerangPayload>(
          setAnimationTargetBoomerang,
          draftProject,
          payload,
        ),
      ),

    createAnimation: (name) => {
      const result = get().createAnimationClip(
        name === undefined ? {} : { name },
      );
      return result.affectedIds[0] ?? null;
    },

    renameAnimation: (id, newName) =>
      get().renameAnimationClip(toAnimationId(id), newName),

    deleteAnimation: (id) => get().deleteAnimationClip(toAnimationId(id)),
  };
}
