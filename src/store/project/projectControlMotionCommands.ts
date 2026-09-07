import { toAnimationId } from "@kukla2d/contracts";

import { upsertAnimationKeyframes } from "@/domain/animationKeyframeCommands.js";
import { createHeadCheekJiggleDraft } from "@/domain/autoMotion/headCheekJiggleDraft.js";
import { createIdleBreathingDraft } from "@/domain/autoMotion/idleBreathingDraft.js";
import { createBakeKeyframes } from "@/domain/autoMotion/modifierBake.js";

import { uid } from "@/lib/uid";

import { deepClone } from "./projectStoreShared.js";

import type {
  ProjectActions,
  ProjectStoreGet,
  ProjectStoreSet,
} from "./projectStoreTypes.types.js";

type ProjectControlMotionCommands = Pick<
  ProjectActions,
  | "createControlHandle"
  | "updateControlHandle"
  | "deleteControlHandle"
  | "createAnimationModifier"
  | "updateAnimationModifier"
  | "deleteAnimationModifier"
  | "reorderAnimationModifiers"
  | "duplicateAnimationModifier"
  | "createIdleBreathingMotion"
  | "createHeadCheekJiggleMotion"
  | "bakeAnimationModifierToKeyframes"
>;

export function createProjectControlMotionCommands(
  _set: ProjectStoreSet,
  get: ProjectStoreGet,
): ProjectControlMotionCommands {
  return {
    createControlHandle: (handle) =>
      get().updateProject((project, vc) => {
        if (!project.controlHandles) project.controlHandles = [];
        project.controlHandles.push({ ...handle });
        vc.transformVersion++;
      }),

    updateControlHandle: (id, patch) =>
      get().updateProject((project, vc) => {
        const handle = (project.controlHandles ?? []).find((h) => h.id === id);
        if (handle) {
          Object.assign(handle, patch);
          vc.transformVersion++;
        }
      }),

    deleteControlHandle: (id) =>
      get().updateProject((project, vc) => {
        if (project.controlHandles) {
          project.controlHandles = project.controlHandles.filter(
            (h) => h.id !== id,
          );
          vc.transformVersion++;
        }
      }),

    createAnimationModifier: (modifier) =>
      get().updateProject((project, vc) => {
        if (!project.animationModifiers) project.animationModifiers = [];
        project.animationModifiers.push({
          ...modifier,
          bindings: { ...(modifier.bindings ?? {}) },
          outputs: (modifier.outputs ?? []).map((o) => ({ ...o })),
          params: { ...(modifier.params ?? {}) },
        });
        vc.transformVersion++;
      }),

    updateAnimationModifier: (id, patch) =>
      get().updateProject((project, vc) => {
        const mod = (project.animationModifiers ?? []).find((m) => m.id === id);
        if (mod) {
          Object.assign(mod, patch);
          vc.transformVersion++;
        }
      }),

    deleteAnimationModifier: (id) =>
      get().updateProject((project, vc) => {
        if (project.animationModifiers) {
          project.animationModifiers = project.animationModifiers.filter(
            (m) => m.id !== id,
          );
          vc.transformVersion++;
        }
      }),

    reorderAnimationModifiers: (ids) =>
      get().updateProject((project, vc) => {
        if (!project.animationModifiers) return;
        const byId = new Map(project.animationModifiers.map((m) => [m.id, m]));
        const reordered = ids.flatMap((id, i) => {
          const mod = byId.get(id);
          if (mod) mod.order = i;
          return mod ? [mod] : [];
        });
        const existing = project.animationModifiers.filter(
          (m) => !byId.has(m.id),
        );
        project.animationModifiers = [...reordered, ...existing];
        vc.transformVersion++;
      }),

    duplicateAnimationModifier: (id) =>
      get().updateProject((project, vc) => {
        const original = (project.animationModifiers ?? []).find(
          (m) => m.id === id,
        );
        if (!original) return;
        const newId = uid();
        const newMod = {
          ...deepClone(original),
          id: newId,
          name: original.name + " Copy",
          order: original.order + 0.5,
        };
        const index = project.animationModifiers.findIndex((m) => m.id === id);
        project.animationModifiers.splice(index + 1, 0, newMod);
        project.animationModifiers.forEach((m, i) => {
          m.order = i;
        });
        vc.transformVersion++;
      }),

    createIdleBreathingMotion: ({ chestNodeId, options = {} }) => {
      const project = get().project;
      const draft = createIdleBreathingDraft({ project, chestNodeId, options });
      if (draft.error) return { changed: false, error: draft.error };

      get().updateProject((projectDraft, vc) => {
        if (!projectDraft.controlHandles) projectDraft.controlHandles = [];
        if (!projectDraft.animationModifiers)
          projectDraft.animationModifiers = [];

        for (const handle of draft.handles ?? []) {
          if (!projectDraft.controlHandles.find((h) => h.id === handle.id)) {
            projectDraft.controlHandles.push(handle);
          }
        }

        for (const shape of draft.blendShapes ?? []) {
          const node = projectDraft.nodes.find((n) => n.id === chestNodeId);
          if (node?.type === "part") {
            if (!node.blendShapes) node.blendShapes = [];
            if (!node.blendShapeValues) node.blendShapeValues = {};
            if (!node.blendShapes.find((s) => s.id === shape.id)) {
              node.blendShapes.push(shape);
              node.blendShapeValues[shape.id] = 0;
            }
          }
        }

        const modifier = draft.modifier;
        if (
          modifier &&
          !projectDraft.animationModifiers.find((m) => m.id === modifier.id)
        ) {
          projectDraft.animationModifiers.push({
            ...modifier,
            bindings: { ...(modifier.bindings ?? {}) },
            outputs: (modifier.outputs ?? []).map((o) => ({ ...o })),
            params: { ...(modifier.params ?? {}) },
          });
        }

        vc.geometryVersion += (draft.blendShapes?.length ?? 0) > 0 ? 1 : 0;
        vc.transformVersion++;
      });

      return { changed: true };
    },

    createHeadCheekJiggleMotion: ({
      sourceBoneId,
      faceNodeId,
      options = {},
    }) => {
      const project = get().project;
      const draft = createHeadCheekJiggleDraft({
        project,
        sourceBoneId,
        faceNodeId,
        options,
      });
      if (draft.error) return { changed: false, error: draft.error };

      get().updateProject((projectDraft, vc) => {
        if (!projectDraft.controlHandles) projectDraft.controlHandles = [];
        if (!projectDraft.animationModifiers)
          projectDraft.animationModifiers = [];

        for (const handle of draft.handles ?? []) {
          if (!projectDraft.controlHandles.find((h) => h.id === handle.id)) {
            projectDraft.controlHandles.push(handle);
          }
        }

        for (const shape of draft.blendShapes ?? []) {
          const node = projectDraft.nodes.find((n) => n.id === faceNodeId);
          if (node?.type === "part") {
            if (!node.blendShapes) node.blendShapes = [];
            if (!node.blendShapeValues) node.blendShapeValues = {};
            if (!node.blendShapes.find((s) => s.id === shape.id)) {
              node.blendShapes.push(shape);
              node.blendShapeValues[shape.id] = 0;
            }
          }
        }

        const modifier = draft.modifier;
        if (
          modifier &&
          !projectDraft.animationModifiers.find((m) => m.id === modifier.id)
        ) {
          projectDraft.animationModifiers.push({
            ...modifier,
            bindings: { ...(modifier.bindings ?? {}) },
            outputs: (modifier.outputs ?? []).map((o) => ({ ...o })),
            params: { ...(modifier.params ?? {}) },
          });
        }

        vc.geometryVersion += (draft.blendShapes?.length ?? 0) > 0 ? 1 : 0;
        vc.transformVersion++;
      });

      return { changed: true };
    },

    bakeAnimationModifierToKeyframes: ({
      modifierId,
      animationId,
      mode = "disable-after-bake",
    }) => {
      const project = get().project;
      const modifier = (project.animationModifiers ?? []).find(
        (m) => m.id === modifierId,
      );
      if (!modifier) return { changed: false, error: "Modifier not found" };

      const animation = (project.animations ?? []).find(
        (a) => a.id === animationId,
      );
      if (!animation)
        return { changed: false, error: "Animation clip not found" };

      if (modifier.driver?.kind !== "time")
        return {
          changed: false,
          error: "Only time-driven modifiers can be baked",
        };

      const keyframes = createBakeKeyframes({ modifier, clip: animation });
      if (keyframes.length === 0)
        return { changed: false, error: "No supported outputs to bake" };

      get().updateProject((projectDraft, vc) => {
        upsertAnimationKeyframes(projectDraft, {
          animationId: toAnimationId(animationId),
          keyframes,
        });

        const mod = (projectDraft.animationModifiers ?? []).find(
          (m) => m.id === modifierId,
        );
        if (mod) {
          if (mode === "disable-after-bake") {
            mod.enabled = false;
          }
          mod.bake = { clipped: true };
        }

        vc.transformVersion++;
      });

      return { changed: true, count: keyframes.length };
    },
  };
}
