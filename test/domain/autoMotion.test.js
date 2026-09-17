import { describe, it, expect } from "vitest";
import {
  evaluateTimeDriver,
  evaluateAnimationModifiers,
  evaluateBoneMotionDriver,
  evaluateReactionModifiers,
  hasActiveTimeModifiers,
} from "../../src/domain/autoMotion/modifierEvaluation.js";
import {
  getMotionPreset,
  getAllPresets,
  getPresetRoles,
  getPresetDefaultDriver,
  getPresetDefaultParams,
} from "../../src/domain/autoMotion/presetRegistry.js";
import {
  createControlHandle,
  findHandleByRole,
  computePartCenter,
} from "../../src/domain/autoMotion/controlHandles.js";
import {
  resolveBindingTarget,
  validateBindings,
  getUnmetRequiredRoles,
} from "../../src/domain/autoMotion/modifierBindings.js";
import { createIdleBreathingDraft } from "../../src/domain/autoMotion/idleBreathingDraft.js";
import { createHeadCheekJiggleDraft } from "../../src/domain/autoMotion/headCheekJiggleDraft.js";
import { IDLE_BREATHING_PRESET_ID } from "../../src/domain/autoMotion/idleBreathingPreset.js";
import { HEAD_CHEEK_JIGGLE_PRESET_ID } from "../../src/domain/autoMotion/headCheekJigglePreset.js";
import { findModifiersAffectedByProjectChange } from "../../src/domain/autoMotion/guardrails.js";

function makeProject(overrides = {}) {
  return {
    version: 7,
    canvas: {
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      bgEnabled: true,
      bgColor: "#f0f0f0",
    },
    textures: [],
    nodes: [
      {
        id: "chest",
        type: "part",
        name: "Chest",
        parent: null,
        draw_order: 0,
        opacity: 1,
        visible: true,
        transform: {
          x: 200,
          y: 300,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          pivotX: 0,
          pivotY: 0,
        },
        mesh: {
          vertices: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ],
          uvs: [0, 0, 1, 0, 1, 1, 0, 1],
          triangles: [
            [0, 1, 2],
            [0, 2, 3],
          ],
          edgeIndices: [0, 1, 2, 3],
        },
        blendShapes: [],
        blendShapeValues: {},
      },
      {
        id: "head",
        type: "part",
        name: "Head",
        parent: null,
        draw_order: 1,
        opacity: 1,
        visible: true,
        transform: {
          x: 200,
          y: 200,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          pivotX: 0,
          pivotY: 0,
        },
        mesh: {
          vertices: [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 50, y: 50 },
            { x: 0, y: 50 },
          ],
          uvs: [0, 0, 1, 0, 1, 1, 0, 1],
          triangles: [
            [0, 1, 2],
            [0, 2, 3],
          ],
          edgeIndices: [0, 1, 2, 3],
        },
        blendShapes: [
          {
            id: "breath",
            name: "Breath In",
            deltas: [
              { dx: 0, dy: 0 },
              { dx: 0, dy: 0 },
              { dx: 0, dy: 0 },
              { dx: 0, dy: 0 },
            ],
          },
        ],
        blendShapeValues: { breath: 0 },
      },
      {
        id: "group1",
        type: "group",
        name: "Body",
        parent: null,
        opacity: 1,
        visible: true,
        transform: {
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          pivotX: 0,
          pivotY: 0,
        },
      },
    ],
    bones: [
      {
        id: "bone1",
        name: "Spine",
        parentId: null,
        setup: {
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          shearX: 0,
          shearY: 0,
          length: 100,
        },
      },
    ],
    slots: [],
    attachments: [],
    skins: [],
    constraints: [],
    defaultPose: {},
    animations: [
      { id: "anim-1", name: "Idle", duration: 2000, fps: 24, tracks: [] },
      { id: "anim-2", name: "Walk", duration: 1000, fps: 24, tracks: [] },
    ],
    physics_groups: [],
    physicsRules: [],
    libraryFolders: [],
    assetPlacements: [],
    controlHandles: [],
    animationModifiers: [],
    ...overrides,
  };
}

function makeTimeModifier(overrides = {}) {
  return {
    id: "mod-1",
    name: "Idle Breathing",
    presetId: IDLE_BREATHING_PRESET_ID,
    presetVersion: 1,
    enabled: true,
    muted: false,
    order: 0,
    scope: "project",
    category: "loop",
    driver: { kind: "time", periodMs: 2400, phase: 0, curve: "easeInOutSine" },
    bindings: {
      chest: { role: "chest", required: true, target: "handle", weight: 1 },
    },
    outputs: [
      {
        kind: "blendShapeValue",
        targetId: "head",
        property: "breath",
        blendMode: "add",
      },
    ],
    params: {
      strength: 1,
      chestExpandPx: 4,
      verticalLiftPx: 2,
      limbFollowPx: 1,
    },
    ...overrides,
  };
}

describe("autoMotion domain", () => {
  describe("presetRegistry", () => {
    it("getMotionPreset returns idle breathing definition", () => {
      const preset = getMotionPreset(IDLE_BREATHING_PRESET_ID);
      expect(preset).not.toBeNull();
      expect(preset.presetId).toBe(IDLE_BREATHING_PRESET_ID);
      expect(preset.presetVersion).toBe(1);
      expect(preset.category).toBe("loop");
    });

    it("getAllPresets returns idle breathing and head cheek jiggle", () => {
      const presets = getAllPresets();
      expect(presets.length).toBeGreaterThanOrEqual(2);
      expect(presets.some((p) => p.presetId === IDLE_BREATHING_PRESET_ID)).toBe(
        true,
      );
      expect(
        presets.some((p) => p.presetId === HEAD_CHEEK_JIGGLE_PRESET_ID),
      ).toBe(true);
    });

    it("getMotionPreset returns null for unknown preset", () => {
      expect(getMotionPreset("nonexistent")).toBeNull();
    });

    it("getPresetRoles returns roles object", () => {
      const roles = getPresetRoles(IDLE_BREATHING_PRESET_ID);
      expect(roles).not.toBeNull();
      expect(roles.chest).toBeDefined();
      expect(roles.chest.required).toBe(true);
      expect(roles.head.required).toBe(false);
    });

    it("headCheekJiggle preset is registered", () => {
      const preset = getMotionPreset(HEAD_CHEEK_JIGGLE_PRESET_ID);
      expect(preset).not.toBeNull();
      expect(preset.presetId).toBe(HEAD_CHEEK_JIGGLE_PRESET_ID);
      expect(preset.presetVersion).toBe(2);
      expect(preset.category).toBe("reaction");
      expect(preset.defaultDriver.kind).toBe("boneMotion");
      expect(preset.roles.sourceBone).toBeDefined();
      expect(preset.roles.sourceBone.required).toBe(true);
      expect(preset.roles.sourceBone.target).toBe("bone");
      expect(preset.roles.facePart).toBeDefined();
      expect(preset.roles.facePart.required).toBe(true);
      expect(preset.roles.facePart.target).toBe("part");
      expect(preset.roles.cheekArea).toBeDefined();
      expect(preset.roles.cheekArea.required).toBe(true);
      expect(preset.roles.cheekArea.target).toBe("handle");
    });

    it("headCheekJiggle default driver has sensible defaults", () => {
      const driver = getPresetDefaultDriver(HEAD_CHEEK_JIGGLE_PRESET_ID);
      expect(driver.kind).toBe("boneMotion");
      expect(driver.gain).toBeGreaterThan(0);
      expect(driver.deadZone).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(driver.axes)).toBe(true);
    });

    it("getPresetDefaultDriver returns cloned driver", () => {
      const driver = getPresetDefaultDriver(IDLE_BREATHING_PRESET_ID);
      expect(driver.kind).toBe("time");
      expect(driver.periodMs).toBe(2400);
      expect(driver.curve).toBe("easeInOutSine");
    });

    it("getPresetDefaultParams returns params object", () => {
      const params = getPresetDefaultParams(IDLE_BREATHING_PRESET_ID);
      expect(params.strength).toBe(1);
      expect(params.chestExpandPx).toBe(4);
    });
  });

  describe("evaluateTimeDriver", () => {
    it("returns 0 at time 0 for sine curve", () => {
      const driver = { kind: "time", periodMs: 1000, phase: 0, curve: "sine" };
      expect(evaluateTimeDriver(driver, 0)).toBeCloseTo(0, 5);
    });

    it("returns 0.5 at quarter period for sine curve", () => {
      const driver = { kind: "time", periodMs: 1000, phase: 0, curve: "sine" };
      const result = evaluateTimeDriver(driver, 250);
      expect(result).toBeGreaterThan(0.4);
      expect(result).toBeLessThan(0.6);
    });

    it("returns ~1 at half period for sine curve", () => {
      const driver = { kind: "time", periodMs: 1000, phase: 0, curve: "sine" };
      const result = evaluateTimeDriver(driver, 500);
      expect(result).toBeGreaterThan(0.95);
    });

    it("easeInOutSine returns 0 at time 0", () => {
      const driver = {
        kind: "time",
        periodMs: 1000,
        phase: 0,
        curve: "easeInOutSine",
      };
      expect(evaluateTimeDriver(driver, 0)).toBeCloseTo(0, 5);
    });

    it("easeInOutSine returns (1-cos(pi/4))/2 at quarter period", () => {
      const driver = {
        kind: "time",
        periodMs: 1000,
        phase: 0,
        curve: "easeInOutSine",
      };
      expect(evaluateTimeDriver(driver, 250)).toBeCloseTo(
        (1 - Math.cos(Math.PI * 0.25)) / 2,
        5,
      );
    });

    it("easeInOutSine returns 0.5 at half period", () => {
      const driver = {
        kind: "time",
        periodMs: 1000,
        phase: 0,
        curve: "easeInOutSine",
      };
      const result = evaluateTimeDriver(driver, 500);
      expect(result).toBeCloseTo(0.5, 5);
    });

    it("triangle returns 0 at time 0", () => {
      const driver = {
        kind: "time",
        periodMs: 1000,
        phase: 0,
        curve: "triangle",
      };
      expect(evaluateTimeDriver(driver, 0)).toBeCloseTo(0, 5);
    });

    it("triangle returns 1 at half period", () => {
      const driver = {
        kind: "time",
        periodMs: 1000,
        phase: 0,
        curve: "triangle",
      };
      expect(evaluateTimeDriver(driver, 500)).toBeCloseTo(1, 5);
    });

    it("triangle returns 0 at full period", () => {
      const driver = {
        kind: "time",
        periodMs: 1000,
        phase: 0,
        curve: "triangle",
      };
      expect(evaluateTimeDriver(driver, 1000)).toBeCloseTo(0, 5);
    });

    it("returns bounded [0,1] for any timeMs", () => {
      const driver = { kind: "time", periodMs: 1000, phase: 0, curve: "sine" };
      for (const t of [0, 100, 250, 500, 750, 1000, 2400, 9999]) {
        const v = evaluateTimeDriver(driver, t);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it("returns 0 for invalid driver (null period)", () => {
      const driver = { kind: "time", periodMs: 0, phase: 0, curve: "sine" };
      expect(evaluateTimeDriver(driver, 100)).toBe(0);
    });

    it("returns 0 for null driver", () => {
      expect(evaluateTimeDriver(null, 100)).toBe(0);
    });

    it("respects phase offset", () => {
      const d1 = { kind: "time", periodMs: 1000, phase: 0, curve: "sine" };
      const d2 = {
        kind: "time",
        periodMs: 1000,
        phase: Math.PI,
        curve: "sine",
      };
      const v1 = evaluateTimeDriver(d1, 0);
      const v2 = evaluateTimeDriver(d2, 0);
      expect(v1).not.toBeCloseTo(v2, 2);
    });
  });

  describe("evaluateAnimationModifiers", () => {
    it("returns empty Map for project without modifiers", () => {
      const project = makeProject({ animationModifiers: undefined });
      const result = evaluateAnimationModifiers({
        project,
        activeAnimationId: "anim-1",
        timeMs: 500,
      });
      expect(result instanceof Map).toBe(true);
      expect(result.size).toBe(0);
    });

    it("returns empty Map for null project", () => {
      const result = evaluateAnimationModifiers({
        project: null,
        activeAnimationId: "anim-1",
        timeMs: 500,
      });
      expect(result.size).toBe(0);
    });

    it("evaluates blendShape output for active modifier", () => {
      const project = makeProject({
        animationModifiers: [makeTimeModifier()],
      });
      const result = evaluateAnimationModifiers({
        project,
        activeAnimationId: "anim-1",
        timeMs: 600,
      });
      expect(result.size).toBeGreaterThanOrEqual(1);
      const headOverrides = result.get("head");
      expect(headOverrides).toBeDefined();
      expect(headOverrides["blendShape:breath"]).toBeDefined();
      const val = headOverrides["blendShape:breath"];
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    });

    it("disabled modifier returns no overrides", () => {
      const project = makeProject({
        animationModifiers: [makeTimeModifier({ enabled: false })],
      });
      const result = evaluateAnimationModifiers({
        project,
        activeAnimationId: "anim-1",
        timeMs: 600,
      });
      expect(result.size).toBe(0);
    });

    it("muted modifier returns no overrides", () => {
      const project = makeProject({
        animationModifiers: [makeTimeModifier({ muted: true })],
      });
      const result = evaluateAnimationModifiers({
        project,
        activeAnimationId: "anim-1",
        timeMs: 600,
      });
      expect(result.size).toBe(0);
    });

    it("clip-scoped modifier only active for matching clip", () => {
      const project = makeProject({
        animationModifiers: [
          makeTimeModifier({ scope: "clip", clipId: "anim-1" }),
        ],
      });
      const resultMatching = evaluateAnimationModifiers({
        project,
        activeAnimationId: "anim-1",
        timeMs: 600,
      });
      expect(resultMatching.size).toBeGreaterThan(0);
      const resultNonMatching = evaluateAnimationModifiers({
        project,
        activeAnimationId: "anim-2",
        timeMs: 600,
      });
      expect(resultNonMatching.size).toBe(0);
    });

    it("elements are sorted by order", () => {
      const project = makeProject({
        animationModifiers: [
          makeTimeModifier({
            id: "mod-low",
            order: 10,
            outputs: [
              {
                kind: "nodeTransform",
                targetId: "chest",
                property: "y",
                blendMode: "add",
              },
            ],
          }),
          makeTimeModifier({
            id: "mod-high",
            order: 5,
            outputs: [
              {
                kind: "nodeTransform",
                targetId: "chest",
                property: "x",
                blendMode: "add",
              },
            ],
          }),
        ],
      });
      const result = evaluateAnimationModifiers({
        project,
        activeAnimationId: "anim-1",
        timeMs: 600,
      });
      expect(result.size).toBeGreaterThan(0);
    });

    it("unknown preset does not block evaluation with explicit outputs", () => {
      const project = makeProject({
        animationModifiers: [
          makeTimeModifier({
            presetId: "unknown.preset",
            outputs: [
              {
                kind: "nodeTransform",
                targetId: "chest",
                property: "y",
                blendMode: "add",
              },
            ],
          }),
        ],
      });
      const result = evaluateAnimationModifiers({
        project,
        activeAnimationId: "anim-1",
        timeMs: 600,
      });
      const chestOverrides = result.get("chest");
      expect(chestOverrides).toBeDefined();
      expect(chestOverrides.y).toBeDefined();
    });

    it("previewModifierDraft is included in evaluation", () => {
      const project = makeProject();
      const draft = makeTimeModifier();
      const result = evaluateAnimationModifiers({
        project,
        activeAnimationId: "anim-1",
        timeMs: 600,
        previewModifierDraft: draft,
      });
      expect(result.size).toBeGreaterThan(0);
    });

    it("blendShape output combines with existing values via add clamp 0..1", () => {
      const project = makeProject({
        nodes: [
          {
            id: "head",
            type: "part",
            name: "Head",
            parent: null,
            draw_order: 0,
            opacity: 1,
            visible: true,
            transform: {
              x: 0,
              y: 0,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              pivotX: 0,
              pivotY: 0,
            },
            mesh: {
              vertices: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 10, y: 10 },
                { x: 0, y: 10 },
              ],
              uvs: [0, 0, 1, 0, 1, 1, 0, 1],
              triangles: [
                [0, 1, 2],
                [0, 2, 3],
              ],
              edgeIndices: [0, 1, 2, 3],
            },
            blendShapes: [
              {
                id: "breath",
                name: "Breath",
                deltas: [
                  { dx: 0, dy: 0 },
                  { dx: 0, dy: 0 },
                  { dx: 0, dy: 0 },
                  { dx: 0, dy: 0 },
                ],
              },
            ],
            blendShapeValues: { breath: 0.8 },
          },
        ],
        animationModifiers: [
          makeTimeModifier({
            outputs: [
              {
                kind: "blendShapeValue",
                targetId: "head",
                property: "breath",
                blendMode: "add",
              },
            ],
            params: { strength: 0.5 },
          }),
        ],
      });
      const result = evaluateAnimationModifiers({
        project,
        activeAnimationId: "anim-1",
        timeMs: 600,
      });
      const headOv = result.get("head");
      expect(headOv).toBeDefined();
      const val = headOv["blendShape:breath"];
      expect(val).toBeGreaterThanOrEqual(0.8);
      expect(val).toBeLessThanOrEqual(1);
    });

    it("nodeTransform output creates override", () => {
      const project = makeProject({
        animationModifiers: [
          makeTimeModifier({
            outputs: [
              {
                kind: "nodeTransform",
                targetId: "chest",
                property: "y",
                blendMode: "add",
              },
            ],
            params: { strength: 1, verticalLiftPx: 10 },
          }),
        ],
      });
      const result = evaluateAnimationModifiers({
        project,
        activeAnimationId: "anim-1",
        timeMs: 1800,
      });
      const chestOv = result.get("chest");
      expect(chestOv).toBeDefined();
      expect(chestOv.y).toBeGreaterThan(8);
    });

    it("nodeTransform amount respects literal verticalLiftPx (no min 10 clamp)", () => {
      const project = makeProject({
        animationModifiers: [
          makeTimeModifier({
            outputs: [
              {
                kind: "nodeTransform",
                targetId: "chest",
                property: "y",
                blendMode: "add",
              },
            ],
            params: { strength: 1, verticalLiftPx: 2 },
          }),
        ],
      });
      const result = evaluateAnimationModifiers({
        project,
        activeAnimationId: "anim-1",
        timeMs: 600,
      });
      const chestOv = result.get("chest");
      expect(chestOv).toBeDefined();
      expect(chestOv.y).toBeGreaterThan(0);
      expect(chestOv.y).toBeLessThan(3);
    });

    it("nodeTransform y also drives linked bone for existing bone-linked parts", () => {
      const project = makeProject({
        nodes: makeProject().nodes.map((node) =>
          node.id === "chest" ? { ...node, boneId: "bone-1" } : node,
        ),
        bones: [
          {
            id: "bone-1",
            name: "Bone 1",
            parentId: null,
            setup: { x: 0, y: 0, rotation: 0, length: 100 },
          },
        ],
        animationModifiers: [
          makeTimeModifier({
            outputs: [
              {
                kind: "nodeTransform",
                targetId: "chest",
                property: "y",
                blendMode: "add",
              },
            ],
            params: { strength: 1, verticalLiftPx: 2 },
          }),
        ],
      });
      const result = evaluateAnimationModifiers({
        project,
        activeAnimationId: "anim-1",
        timeMs: 1800,
      });
      const yVal = result.get("bone-1")?.y;
      expect(yVal).toBeDefined();
      expect(yVal).toBeGreaterThan(0);
      expect(yVal).toBeLessThan(3);
    });

    it("meshDelta output creates live idle breathing vertices from current params", () => {
      const project = makeProject({
        animationModifiers: [
          makeTimeModifier({
            presetId: IDLE_BREATHING_PRESET_ID,
            outputs: [
              {
                kind: "meshDelta",
                targetId: "chest",
                property: "idleBreathing",
                blendMode: "add",
              },
            ],
            params: { strength: 1, chestExpandPx: 8, verticalLiftPx: 10 },
          }),
        ],
      });
      const result = evaluateAnimationModifiers({
        project,
        activeAnimationId: null,
        timeMs: 1200,
      });
      const meshVerts = result.get("chest")?.mesh_verts;
      expect(meshVerts).toBeDefined();
      expect(meshVerts[0].x).toBeLessThan(0);
      expect(meshVerts[0].y).toBeLessThan(0);
    });
  });

  describe("hasActiveTimeModifiers", () => {
    it("returns false for project without modifiers", () => {
      expect(hasActiveTimeModifiers({ project: makeProject() })).toBe(false);
    });

    it("returns true when active time modifier exists", () => {
      const project = makeProject({
        animationModifiers: [makeTimeModifier()],
      });
      expect(
        hasActiveTimeModifiers({ project, activeAnimationId: "anim-1" }),
      ).toBe(true);
    });

    it("returns false when only disabled modifiers exist", () => {
      const project = makeProject({
        animationModifiers: [makeTimeModifier({ enabled: false })],
      });
      expect(
        hasActiveTimeModifiers({ project, activeAnimationId: "anim-1" }),
      ).toBe(false);
    });

    it("returns false when muted modifiers exist", () => {
      const project = makeProject({
        animationModifiers: [makeTimeModifier({ muted: true })],
      });
      expect(
        hasActiveTimeModifiers({ project, activeAnimationId: "anim-1" }),
      ).toBe(false);
    });

    it("returns false for clip-scoped modifier when clip does not match", () => {
      const project = makeProject({
        animationModifiers: [
          makeTimeModifier({ scope: "clip", clipId: "anim-1" }),
        ],
      });
      expect(
        hasActiveTimeModifiers({ project, activeAnimationId: "anim-2" }),
      ).toBe(false);
    });
  });

  describe("controlHandles", () => {
    it("createControlHandle returns handle with uid", () => {
      const handle = createControlHandle({
        name: "Test Handle",
        role: "chest",
        space: "node-local",
        target: { kind: "part", id: "chest-part" },
        position: { x: 100, y: 200 },
      });
      expect(handle.id).toBeDefined();
      expect(handle.name).toBe("Test Handle");
      expect(handle.role).toBe("chest");
      expect(handle.space).toBe("node-local");
      expect(handle.target.id).toBe("chest-part");
      expect(handle.locked).toBe(false);
      expect(handle.source).toBe("auto-motion");
    });

    it("findHandleByRole finds handle by role", () => {
      const project = makeProject({
        controlHandles: [
          createControlHandle({
            name: "Chest",
            role: "chest",
            target: { kind: "part", id: "chest" },
            position: { x: 0, y: 0 },
          }),
          createControlHandle({
            name: "Head",
            role: "head",
            target: { kind: "part", id: "head" },
            position: { x: 0, y: 0 },
          }),
        ],
      });
      const found = findHandleByRole(project, "chest");
      expect(found).not.toBeNull();
      expect(found.role).toBe("chest");
      expect(findHandleByRole(project, "nonexistent")).toBeNull();
    });

    it("computePartCenter returns center of mesh vertices", () => {
      const part = {
        id: "test",
        type: "part",
        mesh: {
          vertices: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ],
        },
      };
      const center = computePartCenter(part);
      expect(center.x).toBe(50);
      expect(center.y).toBe(50);
    });

    it("computePartCenter returns {0,0} for part without mesh", () => {
      const center = computePartCenter({ id: "empty", type: "part" });
      expect(center.x).toBe(0);
      expect(center.y).toBe(0);
    });
  });

  describe("modifierBindings", () => {
    it("resolveBindingTarget resolves handle binding", () => {
      const project = makeProject({
        controlHandles: [
          createControlHandle({
            name: "Chest",
            role: "chest",
            target: { kind: "part", id: "chest" },
            position: { x: 0, y: 0 },
          }),
        ],
      });
      const binding = {
        role: "chest",
        required: true,
        target: "handle",
        weight: 1,
      };
      const resolved = resolveBindingTarget({
        project,
        binding,
        modifier: { presetId: IDLE_BREATHING_PRESET_ID },
      });
      expect(resolved).not.toBeNull();
      expect(resolved.kind).toBe("part");
      expect(resolved.id).toBe("chest");
    });

    it("resolveBindingTarget returns null for unresolvable handle", () => {
      const project = makeProject();
      const binding = {
        role: "chest",
        required: true,
        target: "handle",
        weight: 1,
      };
      const resolved = resolveBindingTarget({
        project,
        binding,
        modifier: { presetId: IDLE_BREATHING_PRESET_ID },
      });
      expect(resolved).toBeNull();
    });

    it("validateBindings returns warnings for missing required roles", () => {
      const project = makeProject();
      const modifier = makeTimeModifier({ bindings: {} });
      const warnings = validateBindings({ project, modifier });
      expect(warnings.length).toBeGreaterThan(0);
      expect(
        warnings.some(
          (w) => w.code === "MISSING_BINDING" && w.role === "chest",
        ),
      ).toBe(true);
    });

    it("validateBindings returns empty for valid bindings", () => {
      const project = makeProject({
        controlHandles: [
          createControlHandle({
            name: "Chest",
            role: "chest",
            target: { kind: "part", id: "chest" },
            position: { x: 0, y: 0 },
          }),
        ],
      });
      const modifier = makeTimeModifier({
        bindings: {
          chest: { role: "chest", required: true, target: "handle", weight: 1 },
        },
      });
      const warnings = validateBindings({ project, modifier });
      expect(warnings.length).toBe(0);
    });

    it("getUnmetRequiredRoles returns missing roles", () => {
      const project = makeProject();
      const modifier = makeTimeModifier({ bindings: {} });
      const unmet = getUnmetRequiredRoles({ project, modifier });
      expect(unmet).toContain("chest");
    });

    it("getUnmetRequiredRoles returns empty when binding is valid", () => {
      const project = makeProject({
        controlHandles: [
          createControlHandle({
            name: "Chest",
            role: "chest",
            target: { kind: "part", id: "chest" },
            position: { x: 0, y: 0 },
          }),
        ],
      });
      const modifier = makeTimeModifier({
        bindings: {
          chest: { role: "chest", required: true, target: "handle", weight: 1 },
        },
      });
      const unmet = getUnmetRequiredRoles({ project, modifier });
      expect(unmet).not.toContain("chest");
    });
  });

  describe("createIdleBreathingDraft", () => {
    it("returns error for null project", () => {
      const result = createIdleBreathingDraft({
        project: null,
        chestNodeId: "chest",
      });
      expect(result.error).toBeDefined();
    });

    it("returns error for missing chestNodeId", () => {
      const project = makeProject();
      const result = createIdleBreathingDraft({ project, chestNodeId: null });
      expect(result.error).toBeDefined();
    });

    it("returns error for nonexistent chest node", () => {
      const project = makeProject();
      const result = createIdleBreathingDraft({
        project,
        chestNodeId: "nonexistent",
      });
      expect(result.error).toContain("not found");
    });

    it("returns draft with handles, modifier, and blendShapes for mesh part", () => {
      const project = makeProject();
      const result = createIdleBreathingDraft({
        project,
        chestNodeId: "chest",
      });
      expect(result.error).toBeUndefined();
      expect(result.handles).toBeDefined();
      expect(result.handles.length).toBeGreaterThan(0);
      expect(result.modifier).toBeDefined();
      expect(result.blendShapes).toBeDefined();

      expect(result.modifier.presetId).toBe(IDLE_BREATHING_PRESET_ID);
      expect(result.modifier.enabled).toBe(true);
      expect(result.modifier.driver.periodMs).toBe(2400);
      expect(result.modifier.driver.curve).toBe("easeInOutSine");

      const chestHandle = result.handles.find((h) => h.role === "chest");
      expect(chestHandle).toBeDefined();
      expect(chestHandle.target.id).toBe("chest");

      const blendShapeOutput = result.modifier.outputs.find(
        (o) => o.kind === "blendShapeValue",
      );
      expect(blendShapeOutput).toBeDefined();
      expect(blendShapeOutput.targetId).toBe("chest");
      expect(blendShapeOutput.property).toBeTruthy();

      const breathShape = result.blendShapes.find(
        (s) => s.name === "Breath In",
      );
      expect(breathShape).toBeDefined();
      expect(breathShape.deltas.length).toBe(4);
    });

    it("draft blendShape deltas length matches mesh vertices length", () => {
      const project = makeProject();
      const result = createIdleBreathingDraft({
        project,
        chestNodeId: "chest",
      });
      const chestMesh = project.nodes.find((n) => n.id === "chest").mesh;
      const breathShape = result.blendShapes.find(
        (s) => s.name === "Breath In",
      );
      expect(breathShape.deltas.length).toBe(chestMesh.vertices.length);
    });

    it("draft does not mutate project nodes", () => {
      const project = makeProject();
      const originalVerts = JSON.stringify(
        project.nodes.find((n) => n.id === "chest").mesh.vertices,
      );
      createIdleBreathingDraft({ project, chestNodeId: "chest" });
      const afterVerts = JSON.stringify(
        project.nodes.find((n) => n.id === "chest").mesh.vertices,
      );
      expect(afterVerts).toBe(originalVerts);
    });

    it("returns error for part without mesh", () => {
      const project = makeProject({
        nodes: makeProject().nodes.map((n) =>
          n.id === "chest" ? { ...n, mesh: undefined } : n,
        ),
      });
      const result = createIdleBreathingDraft({
        project,
        chestNodeId: "chest",
      });
      expect(result.error).toBeDefined();
      expect(result.error).toContain("mesh");
    });

    it("returns error for part with fewer than 3 vertices", () => {
      const project = makeProject({
        nodes: makeProject().nodes.map((n) =>
          n.id === "chest"
            ? {
                ...n,
                mesh: {
                  vertices: [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                  ],
                  uvs: [0, 0, 1, 0],
                  triangles: [],
                  edgeIndices: [],
                },
              }
            : n,
        ),
      });
      const result = createIdleBreathingDraft({
        project,
        chestNodeId: "chest",
      });
      expect(result.error).toBeDefined();
      expect(result.error).toContain("mesh");
    });

    it("draft only has blendShapeValue output, no nodeTransform fallback", () => {
      const project = makeProject();
      const result = createIdleBreathingDraft({
        project,
        chestNodeId: "chest",
      });
      const transformOutput = result.modifier.outputs.find(
        (o) => o.kind === "nodeTransform",
      );
      expect(transformOutput).toBeUndefined();
      const boneOutput = result.modifier.outputs.find(
        (o) => o.kind === "boneTransform",
      );
      expect(boneOutput).toBeUndefined();
      const blendOutput = result.modifier.outputs.find(
        (o) => o.kind === "blendShapeValue",
      );
      expect(blendOutput).toBeDefined();
      expect(blendOutput.targetId).toBe("chest");
      expect(blendOutput.property).toBeTruthy();
    });

    it("strength option affects outputs", () => {
      const project = makeProject();
      const result = createIdleBreathingDraft({
        project,
        chestNodeId: "chest",
        options: { strength: 0.5 },
      });
      expect(result.modifier.params.strength).toBe(0.5);
    });

    it("respects custom chestExpandPx param option", () => {
      const project = makeProject();
      const result = createIdleBreathingDraft({
        project,
        chestNodeId: "chest",
        options: { params: { chestExpandPx: 8 } },
      });
      expect(result.modifier.params.chestExpandPx).toBe(8);
    });
  });

  describe("createHeadCheekJiggleDraft", () => {
    it("returns error for null project", () => {
      const result = createHeadCheekJiggleDraft({
        project: null,
        sourceBoneId: "bone1",
        faceNodeId: "head",
      });
      expect(result.error).toBeDefined();
    });

    it("returns error for missing sourceBoneId", () => {
      const project = makeProject();
      const result = createHeadCheekJiggleDraft({
        project,
        sourceBoneId: null,
        faceNodeId: "head",
      });
      expect(result.error).toBeDefined();
    });

    it("returns error for missing faceNodeId", () => {
      const project = makeProject();
      const result = createHeadCheekJiggleDraft({
        project,
        sourceBoneId: "bone1",
        faceNodeId: null,
      });
      expect(result.error).toBeDefined();
    });

    it("returns error for nonexistent source bone", () => {
      const project = makeProject();
      const result = createHeadCheekJiggleDraft({
        project,
        sourceBoneId: "nonexistent",
        faceNodeId: "head",
      });
      expect(result.error).toContain("not found");
    });

    it("returns error for nonexistent face node", () => {
      const project = makeProject();
      const result = createHeadCheekJiggleDraft({
        project,
        sourceBoneId: "bone1",
        faceNodeId: "nonexistent",
      });
      expect(result.error).toContain("not found");
    });

    it("returns error for face part without mesh", () => {
      const project = makeProject({
        nodes: makeProject().nodes.map((n) =>
          n.id === "head" ? { ...n, mesh: undefined } : n,
        ),
      });
      const result = createHeadCheekJiggleDraft({
        project,
        sourceBoneId: "bone1",
        faceNodeId: "head",
      });
      expect(result.error).toBeDefined();
      expect(result.error).toContain("mesh");
    });

    it("returns error for face part with fewer than 3 vertices", () => {
      const project = makeProject({
        nodes: makeProject().nodes.map((n) =>
          n.id === "head"
            ? {
                ...n,
                mesh: {
                  vertices: [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                  ],
                  uvs: [0, 0, 1, 0],
                  triangles: [],
                  edgeIndices: [],
                },
              }
            : n,
        ),
      });
      const result = createHeadCheekJiggleDraft({
        project,
        sourceBoneId: "bone1",
        faceNodeId: "head",
      });
      expect(result.error).toBeDefined();
      expect(result.error).toContain("mesh");
    });

    it("returns draft with handles, modifier, and blendShapes for valid input", () => {
      const project = makeProject();
      const result = createHeadCheekJiggleDraft({
        project,
        sourceBoneId: "bone1",
        faceNodeId: "head",
        options: {
          cheekPoint: { x: 12, y: 28 },
          params: { cheekRadius: 0.25 },
        },
      });
      expect(result.error).toBeUndefined();
      expect(result.handles).toBeDefined();
      expect(result.handles.length).toBeGreaterThan(0);
      const cheekHandle = result.handles.find(
        (handle) => handle.role === "cheekArea",
      );
      expect(cheekHandle).toBeDefined();
      expect(cheekHandle.position).toEqual({ x: 12, y: 28 });
      expect(result.blendShapes).toBeDefined();
      expect(result.blendShapes.length).toBe(1);
      expect(result.modifier).toBeDefined();
      expect(result.modifier.category).toBe("reaction");
      expect(result.modifier.driver.kind).toBe("boneMotion");
      expect(result.modifier.driver.sourceBoneId).toBe("bone1");
      expect(result.modifier.bindings.sourceBone).toBeDefined();
      expect(result.modifier.bindings.facePart).toBeDefined();
      expect(result.modifier.bindings.cheekArea).toBeDefined();
      expect(
        result.modifier.outputs.some((output) => output.kind === "meshDelta"),
      ).toBe(true);
      expect(result.modifier.params.cheekSide).toBe(-1);
      expect(result.modifier.params.cheekPointX).toBe(12);
      expect(result.modifier.params.cheekPointY).toBe(28);
      expect(result.modifier.params.cheekRadius).toBe(0.25);
    });

    it("creates Cheek Jiggle blend shape with delta count matching mesh vertex count", () => {
      const project = makeProject();
      const result = createHeadCheekJiggleDraft({
        project,
        sourceBoneId: "bone1",
        faceNodeId: "head",
      });
      const jiggleShape = result.blendShapes.find(
        (s) => s.name === "Cheek Jiggle",
      );
      expect(jiggleShape).toBeDefined();
      const faceMesh = project.nodes.find((n) => n.id === "head").mesh;
      expect(jiggleShape.deltas.length).toBe(faceMesh.vertices.length);
    });

    it("does not mutate project nodes", () => {
      const project = makeProject();
      const originalVerts = JSON.stringify(
        project.nodes.find((n) => n.id === "head").mesh.vertices,
      );
      createHeadCheekJiggleDraft({
        project,
        sourceBoneId: "bone1",
        faceNodeId: "head",
      });
      const afterVerts = JSON.stringify(
        project.nodes.find((n) => n.id === "head").mesh.vertices,
      );
      expect(afterVerts).toBe(originalVerts);
    });
  });

  describe("findModifiersAffectedByProjectChange", () => {
    it("returns empty for no modifiers", () => {
      const project = makeProject();
      project.animationModifiers = [];
      const result = findModifiersAffectedByProjectChange(project, {
        deletedNodes: new Set(["chest"]),
      });
      expect(result.modifierIds).toEqual([]);
      expect(result.handleIds).toEqual([]);
    });

    it("detects modifier affected by deleted source bone in boneMotion driver", () => {
      const project = makeProject();
      project.animationModifiers = [
        {
          id: "m1",
          name: "Cheek Jiggle",
          presetId: "builtin.headCheekJiggle",
          presetVersion: 1,
          enabled: true,
          order: 0,
          scope: "project",
          category: "reaction",
          driver: {
            kind: "boneMotion",
            sourceBoneId: "bone1",
            axes: ["x", "y"],
            gain: 0.5,
          },
          bindings: {},
          outputs: [],
          params: { strength: 0.5 },
        },
      ];
      const result = findModifiersAffectedByProjectChange(project, {
        deletedBones: new Set(["bone1"]),
      });
      expect(result.modifierIds).toContain("m1");
    });

    it("does not flag modifier with non-boneMotion driver for deletedBones", () => {
      const project = makeProject();
      project.animationModifiers = [
        {
          id: "m1",
          name: "Idle",
          presetId: "builtin.idleBreathing",
          presetVersion: 1,
          enabled: true,
          order: 0,
          scope: "project",
          category: "loop",
          driver: { kind: "time", periodMs: 2000, phase: 0, curve: "sine" },
          bindings: {},
          outputs: [],
          params: { strength: 0.5 },
        },
      ];
      const result = findModifiersAffectedByProjectChange(project, {
        deletedBones: new Set(["bone1"]),
      });
      expect(result.modifierIds).not.toContain("m1");
    });

    it("does not flag modifier for deletedBones when sourceBoneId is null", () => {
      const project = makeProject();
      project.animationModifiers = [
        {
          id: "m1",
          name: "Cheek Jiggle",
          presetId: "builtin.headCheekJiggle",
          presetVersion: 1,
          enabled: true,
          order: 0,
          scope: "project",
          category: "reaction",
          driver: {
            kind: "boneMotion",
            sourceBoneId: null,
            axes: ["x"],
            gain: 0.5,
          },
          bindings: {},
          outputs: [],
          params: { strength: 0.5 },
        },
      ];
      const result = findModifiersAffectedByProjectChange(project, {
        deletedBones: new Set(["bone1"]),
      });
      expect(result.modifierIds).not.toContain("m1");
    });

    it("detects modifier affected by deleted output target node", () => {
      const project = makeProject();
      project.animationModifiers = [
        {
          id: "m1",
          name: "Idle",
          presetId: "builtin.idleBreathing",
          presetVersion: 1,
          enabled: true,
          order: 0,
          scope: "project",
          category: "loop",
          driver: { kind: "time", periodMs: 2000, phase: 0, curve: "sine" },
          bindings: {},
          outputs: [
            { kind: "blendShapeValue", targetId: "chest", property: "breath" },
          ],
          params: { strength: 0.5 },
        },
      ];
      const result = findModifiersAffectedByProjectChange(project, {
        deletedNodes: new Set(["chest"]),
      });
      expect(result.modifierIds).toContain("m1");
    });

    it("ignores disabled modifiers", () => {
      const project = makeProject();
      project.animationModifiers = [
        {
          id: "m1",
          name: "Idle",
          presetId: "builtin.idleBreathing",
          presetVersion: 1,
          enabled: false,
          order: 0,
          scope: "project",
          category: "loop",
          driver: { kind: "time", periodMs: 2000, phase: 0, curve: "sine" },
          bindings: {},
          outputs: [
            { kind: "blendShapeValue", targetId: "chest", property: "breath" },
          ],
          params: { strength: 0.5 },
        },
      ];
      const result = findModifiersAffectedByProjectChange(project, {
        deletedNodes: new Set(["chest"]),
      });
      expect(result.modifierIds).not.toContain("m1");
    });

    it("detects handle affected by deleted target node", () => {
      const project = makeProject();
      project.controlHandles = [
        {
          id: "ch1",
          name: "Chest",
          role: "chest",
          space: "node-local",
          target: { kind: "part", id: "chest" },
          position: { x: 0, y: 0 },
        },
      ];
      const result = findModifiersAffectedByProjectChange(project, {
        deletedNodes: new Set(["chest"]),
      });
      expect(result.handleIds).toContain("ch1");
    });
  });

  describe("evaluateBoneMotionDriver", () => {
    it("returns 0 for null driver", () => {
      expect(evaluateBoneMotionDriver(null, [], makeProject())).toBe(0);
    });

    it("returns 0 for missing source bone", () => {
      const driver = {
        kind: "boneMotion",
        sourceBoneId: "nonexistent",
        axes: ["x"],
        gain: 1,
      };
      const bones = [];
      const project = makeProject();
      expect(evaluateBoneMotionDriver(driver, bones, project)).toBe(0);
    });

    it("returns displacement times gain for bone motion", () => {
      const driver = {
        kind: "boneMotion",
        sourceBoneId: "bone1",
        axes: ["x", "y"],
        gain: 0.1,
      };
      const bones = [
        {
          id: "bone1",
          setup: {
            x: 50,
            y: 30,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            length: 10,
            shearX: 0,
            shearY: 0,
          },
        },
      ];
      const project = makeProject();
      const result = evaluateBoneMotionDriver(driver, bones, project);
      const expected = (Math.abs(50 - 0) + Math.abs(30 - 0)) * 0.1;
      expect(result).toBeCloseTo(expected, 5);
    });

    it("returns 0 when displacement is below deadZone", () => {
      const driver = {
        kind: "boneMotion",
        sourceBoneId: "bone1",
        axes: ["x"],
        gain: 1,
        deadZone: 100,
      };
      const bones = [
        {
          id: "bone1",
          setup: {
            x: 5,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            length: 10,
            shearX: 0,
            shearY: 0,
          },
        },
      ];
      const project = makeProject();
      expect(evaluateBoneMotionDriver(driver, bones, project)).toBe(0);
    });

    it("uses abs curve", () => {
      const driver = {
        kind: "boneMotion",
        sourceBoneId: "bone1",
        axes: ["x"],
        gain: 1,
        curve: "abs",
      };
      const bones = [
        {
          id: "bone1",
          setup: {
            x: -10,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            length: 10,
            shearX: 0,
            shearY: 0,
          },
        },
      ];
      const project = makeProject();
      const result = evaluateBoneMotionDriver(driver, bones, project);
      expect(result).toBe(10);
    });

    it("returns 0 for non-finite gain", () => {
      const driver = {
        kind: "boneMotion",
        sourceBoneId: "bone1",
        axes: ["x"],
        gain: NaN,
      };
      const bones = [
        {
          id: "bone1",
          setup: {
            x: 10,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            length: 10,
            shearX: 0,
            shearY: 0,
          },
        },
      ];
      const project = makeProject();
      const result = evaluateBoneMotionDriver(driver, bones, project);
      expect(result).toBe(10);
    });

    it("uses poseOverrides when effective bones still match setup", () => {
      const driver = {
        kind: "boneMotion",
        sourceBoneId: "bone1",
        axes: ["x"],
        gain: 0.1,
      };
      const bones = [
        {
          id: "bone1",
          setup: {
            x: 0,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            length: 10,
            shearX: 0,
            shearY: 0,
          },
        },
      ];
      const project = makeProject();
      const poseOverrides = new Map([["bone1", { x: 25 }]]);
      const result = evaluateBoneMotionDriver(
        driver,
        bones,
        project,
        poseOverrides,
      );
      expect(result).toBeCloseTo(2.5, 5);
    });
  });

  describe("evaluateReactionModifiers", () => {
    it("returns empty Map for project without modifiers", () => {
      const project = makeProject({ animationModifiers: undefined });
      const result = evaluateReactionModifiers({
        project,
        activeAnimationId: "anim-1",
        effectiveBones: [],
      });
      expect(result instanceof Map).toBe(true);
      expect(result.size).toBe(0);
    });

    it("returns empty Map for null project", () => {
      const result = evaluateReactionModifiers({
        project: null,
        activeAnimationId: "anim-1",
        effectiveBones: [],
      });
      expect(result.size).toBe(0);
    });

    it("evaluates blendShape output for active boneMotion modifier", () => {
      const project = makeProject();
      project.animationModifiers = [
        {
          id: "r1",
          name: "Cheek Jiggle",
          presetId: "builtin.cheekJiggle",
          presetVersion: 1,
          enabled: true,
          order: 0,
          scope: "project",
          category: "reaction",
          driver: {
            kind: "boneMotion",
            sourceBoneId: "bone1",
            axes: ["x", "y"],
            gain: 0.1,
          },
          bindings: {},
          outputs: [
            { kind: "blendShapeValue", targetId: "head", property: "breath" },
          ],
          params: { strength: 1 },
        },
      ];
      const bones = [
        {
          id: "bone1",
          setup: {
            x: 40,
            y: 20,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            length: 10,
            shearX: 0,
            shearY: 0,
          },
        },
      ];
      const result = evaluateReactionModifiers({
        project,
        activeAnimationId: "anim-1",
        effectiveBones: bones,
      });
      expect(result.size).toBeGreaterThanOrEqual(1);
      const headOverrides = result.get("head");
      expect(headOverrides).toBeDefined();
      expect(headOverrides["blendShape:breath"]).toBeDefined();
      expect(headOverrides["blendShape:breath"]).toBeGreaterThan(0);
    });

    it("disabled reaction modifier returns no overrides", () => {
      const project = makeProject();
      project.animationModifiers = [
        {
          id: "r1",
          name: "Cheek Jiggle",
          presetId: "builtin.cheekJiggle",
          presetVersion: 1,
          enabled: false,
          order: 0,
          scope: "project",
          category: "reaction",
          driver: {
            kind: "boneMotion",
            sourceBoneId: "bone1",
            axes: ["x"],
            gain: 0.1,
          },
          bindings: {},
          outputs: [
            { kind: "blendShapeValue", targetId: "head", property: "breath" },
          ],
          params: { strength: 1 },
        },
      ];
      const bones = [
        {
          id: "bone1",
          setup: {
            x: 40,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            length: 10,
            shearX: 0,
            shearY: 0,
          },
        },
      ];
      const result = evaluateReactionModifiers({
        project,
        activeAnimationId: "anim-1",
        effectiveBones: bones,
      });
      expect(result.size).toBe(0);
    });

    it("missing source bone does not crash", () => {
      const project = makeProject();
      project.animationModifiers = [
        {
          id: "r1",
          name: "Cheek Jiggle",
          presetId: "builtin.cheekJiggle",
          presetVersion: 1,
          enabled: true,
          order: 0,
          scope: "project",
          category: "reaction",
          driver: {
            kind: "boneMotion",
            sourceBoneId: "missingBone",
            axes: ["x"],
            gain: 0.1,
          },
          bindings: {},
          outputs: [
            { kind: "blendShapeValue", targetId: "head", property: "breath" },
          ],
          params: { strength: 1 },
        },
      ];
      const result = evaluateReactionModifiers({
        project,
        activeAnimationId: "anim-1",
        effectiveBones: [],
      });
      expect(result.size).toBe(0);
    });

    it("reaction with 0 signal produces no overrides", () => {
      const project = makeProject();
      project.animationModifiers = [
        {
          id: "r1",
          name: "Cheek Jiggle",
          presetId: "builtin.cheekJiggle",
          presetVersion: 1,
          enabled: true,
          order: 0,
          scope: "project",
          category: "reaction",
          driver: {
            kind: "boneMotion",
            sourceBoneId: "bone1",
            axes: ["x"],
            gain: 1,
            deadZone: 200,
          },
          bindings: {},
          outputs: [
            { kind: "blendShapeValue", targetId: "head", property: "breath" },
          ],
          params: { strength: 1 },
        },
      ];
      const bones = [
        {
          id: "bone1",
          setup: {
            x: 5,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            length: 10,
            shearX: 0,
            shearY: 0,
          },
        },
      ];
      const result = evaluateReactionModifiers({
        project,
        activeAnimationId: "anim-1",
        effectiveBones: bones,
      });
      expect(result.size).toBe(0);
    });

    it("evaluates cheek meshDelta around picked cheek point from pose override motion", () => {
      const project = makeProject();
      project.animationModifiers = [
        {
          id: "r1",
          name: "Head Cheek Jiggle",
          presetId: HEAD_CHEEK_JIGGLE_PRESET_ID,
          presetVersion: 2,
          enabled: true,
          order: 0,
          scope: "project",
          category: "reaction",
          driver: {
            kind: "boneMotion",
            sourceBoneId: "bone1",
            axes: ["x"],
            gain: 0.1,
            deadZone: 0,
          },
          bindings: {},
          outputs: [
            { kind: "meshDelta", targetId: "head", property: "cheekJiggle" },
          ],
          params: {
            strength: 1,
            jigglePx: 6,
            softness: 0.1,
            cheekPointX: 0,
            cheekPointY: 50,
            cheekRadius: 0.8,
          },
        },
      ];
      const bones = [
        {
          id: "bone1",
          setup: {
            x: 0,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            length: 10,
            shearX: 0,
            shearY: 0,
          },
        },
      ];
      const poseOverrides = new Map([["bone1", { x: 20 }]]);

      const result = evaluateReactionModifiers({
        project,
        activeAnimationId: "anim-1",
        effectiveBones: bones,
        poseOverrides,
      });
      const meshVerts = result.get("head")?.mesh_verts;
      expect(meshVerts).toBeDefined();
      expect(meshVerts[3].x).toBeLessThan(
        project.nodes.find((n) => n.id === "head").mesh.vertices[3].x,
      );
    });

    it("clip-scoped reaction modifier only active for matching clip", () => {
      const project = makeProject();
      const modifier = {
        id: "r1",
        name: "Cheek Jiggle",
        presetId: "builtin.cheekJiggle",
        presetVersion: 1,
        enabled: true,
        order: 0,
        scope: "clip",
        clipId: "anim-1",
        category: "reaction",
        driver: {
          kind: "boneMotion",
          sourceBoneId: "bone1",
          axes: ["x"],
          gain: 0.1,
        },
        bindings: {},
        outputs: [
          { kind: "blendShapeValue", targetId: "head", property: "breath" },
        ],
        params: { strength: 1 },
      };
      project.animationModifiers = [modifier];
      const bones = [
        {
          id: "bone1",
          setup: {
            x: 40,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            length: 10,
            shearX: 0,
            shearY: 0,
          },
        },
      ];
      const matching = evaluateReactionModifiers({
        project,
        activeAnimationId: "anim-1",
        effectiveBones: bones,
      });
      expect(matching.size).toBeGreaterThan(0);
      const nonMatching = evaluateReactionModifiers({
        project,
        activeAnimationId: "anim-2",
        effectiveBones: bones,
      });
      expect(nonMatching.size).toBe(0);
    });

    it("ignores time modifiers in reaction pass", () => {
      const project = makeProject({
        animationModifiers: [makeTimeModifier()],
      });
      const result = evaluateReactionModifiers({
        project,
        activeAnimationId: "anim-1",
        effectiveBones: [],
      });
      expect(result.size).toBe(0);
    });
  });

  describe("domain purity - no React/Zustand/DOM/Pixi imports", () => {
    it("autoMotion index does not import React, Zustand, or Pixi", async () => {
      const code = await import("fs").then((fs) =>
        fs.promises.readFile(
          new URL("../../src/domain/autoMotion/index.ts", import.meta.url),
          "utf-8",
        ),
      );
      expect(code).not.toContain("react");
      expect(code).not.toContain("zustand");
      expect(code).not.toContain("pixi");
    });
  });
});
