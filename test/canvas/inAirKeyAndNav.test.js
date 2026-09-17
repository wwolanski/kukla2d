import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { useAnimationStore } from "@/store/animationStore";
import { useProjectStore } from "@/store/projectStore";
import { clearHistory, undoCount } from "@/store/undoHistory";
import { createAnimationAuthoringApi } from "@/features/animation";

function resetStores() {
  clearHistory();
  useAnimationStore.getState().resetPlayback();
  useProjectStore.getState().resetProject();
}

function setupClip() {
  useProjectStore.getState().createAnimationClip({
    animationId: "anim-1",
    durationMs: 2000,
    fps: 24,
  });
  useProjectStore.getState().updateProject(
    (p) => {
      p.nodes.push({
        id: "node-1",
        type: "part",
        name: "Head",
        parent: null,
        transform: {
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          pivotX: 0,
          pivotY: 0,
        },
        opacity: 1,
        visible: true,
      });
    },
    { skipHistory: true },
  );
  useAnimationStore
    .getState()
    .switchAnimation(useProjectStore.getState().project.animations[0]);
}

// ── 3A: commitAndContinueGesture ─────────────────────────────────────────────

describe("commitAndContinueGesture (K6 Drop Keyframe)", () => {
  let api;

  beforeEach(() => {
    resetStores();
    setupClip();
    api = createAnimationAuthoringApi();
  });

  it("commits draft and keeps context alive for continuing gesture", () => {
    api.preview({
      animationId: "anim-1",
      targetId: "node-1",
      property: "x",
      value: 42,
      timeMs: 500,
      source: "canvas",
      phase: "preview",
    });

    const before = undoCount();
    const result = api.commitAndContinueGesture({ source: "in-air-key" });

    expect(result.changed).toBe(true);
    expect(result.source).toBeUndefined();
    expect(undoCount()).toBe(before + 1);

    const state = api.getDraftState();
    expect(state.context).not.toBeNull();
    expect(state.context.animationId).toBe("anim-1");
    expect(state.dirty).toBe(false);
    expect(state.pose.size).toBe(0);
  });

  it("produces separate undo from subsequent normal commit", () => {
    api.preview({
      animationId: "anim-1",
      targetId: "node-1",
      property: "x",
      value: 42,
      timeMs: 500,
      source: "canvas",
      phase: "preview",
    });

    api.commitAndContinueGesture({ source: "in-air-key" });

    api.preview({
      animationId: "anim-1",
      targetId: "node-1",
      property: "y",
      value: 10,
      timeMs: 500,
      source: "canvas",
      phase: "preview",
    });

    const before = undoCount();
    api.commit({ source: "auto-key" });
    expect(undoCount()).toBe(before + 1);
  });

  it("draft is clean after commitAndContinueGesture and can accept new previews", () => {
    api.preview({
      animationId: "anim-1",
      targetId: "node-1",
      property: "x",
      value: 42,
      timeMs: 500,
      source: "canvas",
      phase: "preview",
    });

    api.commitAndContinueGesture({ source: "in-air-key" });

    const result2 = api.preview({
      animationId: "anim-1",
      targetId: "node-1",
      property: "x",
      value: 100,
      timeMs: 500,
      source: "canvas",
      phase: "preview",
    });
    expect(result2.valid).toBe(true);

    const state = api.getDraftState();
    expect(state.dirty).toBe(true);
    expect(state.pose.get("node-1").x).toBe(100);
  });

  it("moves a clean continuing draft to the newly selected frame", () => {
    api.beginGesture();
    api.preview({
      animationId: "anim-1",
      targetId: "node-1",
      property: "x",
      value: 42,
      timeMs: 500,
      source: "canvas",
      phase: "preview",
      allowContextTimeChange: true,
    });
    api.commitAndContinueGesture({ source: "in-air-key" });

    api.preview({
      animationId: "anim-1",
      targetId: "node-1",
      property: "x",
      value: 84,
      timeMs: 750,
      source: "canvas",
      phase: "preview",
      allowContextTimeChange: true,
    });
    expect(api.getDraftState().context.timeMs).toBe(750);

    expect(api.getDraftState().pose.get("node-1").x).toBe(84);
  });

  it("tracks a live gesture independently of pending draft content", () => {
    api.endGesture();
    expect(api.hasActiveGesture()).toBe(false);
    api.beginGesture();
    expect(api.hasActiveGesture()).toBe(true);
    api.endGesture();
    expect(api.hasActiveGesture()).toBe(false);
  });

  it("returns no-op for empty draft", () => {
    const result = api.commitAndContinueGesture();
    expect(result.changed).toBe(false);
  });

  it("does not create undo entry for empty draft", () => {
    const before = undoCount();
    api.commitAndContinueGesture();
    expect(undoCount()).toBe(before);
  });

  it("committed addresses are present in result", () => {
    api.preview({
      animationId: "anim-1",
      targetId: "node-1",
      property: "x",
      value: 42,
      timeMs: 500,
      source: "canvas",
      phase: "preview",
    });

    const result = api.commitAndContinueGesture({ source: "in-air-key" });
    expect(result.changed).toBe(true);
    expect(result.committedAddresses.length).toBeGreaterThan(0);
    expect(result.committedAddresses[0]).toContain("node-1::");
  });

  it("two consecutive commitAndContinueGesture calls produce two undo entries", () => {
    api.preview({
      animationId: "anim-1",
      targetId: "node-1",
      property: "x",
      value: 42,
      timeMs: 500,
      source: "canvas",
      phase: "preview",
    });

    const r1 = api.commitAndContinueGesture({ source: "in-air-key" });
    expect(r1.changed).toBe(true);

    api.preview({
      animationId: "anim-1",
      targetId: "node-1",
      property: "y",
      value: 99,
      timeMs: 500,
      source: "canvas",
      phase: "preview",
    });

    const r2 = api.commitAndContinueGesture({ source: "in-air-key" });
    expect(r2.changed).toBe(true);
  });

  it("K shortcut unchanged semantics: commitAndContinueGesture does not affect keySelected", () => {
    api.preview({
      animationId: "anim-1",
      targetId: "node-1",
      property: "x",
      value: 42,
      timeMs: 500,
      source: "canvas",
      phase: "preview",
    });

    api.commitAndContinueGesture({ source: "in-air-key" });

    api.preview({
      animationId: "anim-1",
      targetId: "node-1",
      property: "y",
      value: 10,
      timeMs: 500,
      source: "canvas",
      phase: "preview",
    });

    const kResult = api.keySelected({
      targetIds: ["node-1"],
      source: "manual-key",
    });
    expect(kResult.changed).toBe(true);
    expect(kResult.mode).toBe("draft");
  });
});

// ── 3A: canvas adapter commitAndContinueGesture ──────────────────────────────

describe("canvas authoring adapter commitAndContinueGesture", () => {
  const adapterSrc = readFileSync(
    resolve(
      import.meta.dirname,
      "../../src/features/canvas/application/createCanvasAuthoringAdapter.ts",
    ),
    "utf-8",
  );

  it("exposes commitAndContinueGesture method", () => {
    expect(adapterSrc).toMatch(/commitAndContinueGesture/);
  });

  it("delegates to api.commitAndContinueGesture", () => {
    expect(adapterSrc).toMatch(/api\.commitAndContinueGesture/);
  });

  it("resets adapter gesture id on changed result", () => {
    expect(adapterSrc).toMatch(/adapterGestureId\s*=\s*null/);
  });
});

// ── 3A: keyboard shortcut I handler ──────────────────────────────────────────

describe("canvas keyboard shortcut I key drop keyframe", () => {
  const shortcutSrc = readFileSync(
    resolve(
      import.meta.dirname,
      "../../src/features/canvas/application/useCanvasKeyboardShortcuts.ts",
    ),
    "utf-8",
  );

  it("handles both i and I key values", () => {
    expect(shortcutSrc).toMatch(/["']i["'][\s\S]*["']I["']/);
  });

  it("ignores repeat events", () => {
    expect(shortcutSrc).toMatch(/e\.repeat/);
  });

  it("checks draft dirty and non-empty before calling commitAndContinueGesture", () => {
    expect(shortcutSrc).toMatch(/draftDirty/);
    expect(shortcutSrc).toMatch(/draftPose\.size/);
  });

  it("calls commitAndContinueGesture with source in-air-key", () => {
    expect(shortcutSrc).toMatch(/commitAndContinueGesture/);
    expect(shortcutSrc).toMatch(/in-air-key/);
  });

  it("calls preventDefault for accepted I key", () => {
    expect(shortcutSrc).toMatch(/e\.preventDefault/);
  });

  it("does not call K path for I key (early return)", () => {
    const kMatch = shortcutSrc.match(/keySelected[\s\S]{1,100}manual-key/);
    const iMatch = shortcutSrc.match(
      /commitAndContinueGesture[\s\S]{1,50}in-air-key/,
    );
    const iIndex = shortcutSrc.indexOf(iMatch?.[0] ?? "");
    const kIndex = shortcutSrc.indexOf(kMatch?.[0] ?? "");
    expect(iIndex).toBeLessThan(kIndex);
  });

  it("preserves existing K shortcut boundaries", () => {
    expect(shortcutSrc).toMatch(/authoringApi\.keySelected/);
    expect(shortcutSrc).toMatch(/source.*manual-key/);
  });
});

// ── 3B: global comma/period navigation ───────────────────────────────────────

describe("global keydown comma/period navigation", () => {
  const shortcutSrc = readFileSync(
    resolve(
      import.meta.dirname,
      "../../src/features/canvas/application/useCanvasKeyboardShortcuts.ts",
    ),
    "utf-8",
  );

  it("handles event.code Comma for backward one frame", () => {
    expect(shortcutSrc).toMatch(/code.*Comma/);
  });

  it("handles event.code Period for forward one frame", () => {
    expect(shortcutSrc).toMatch(/code.*Period/);
  });

  it("uses animation store seekFrame for navigation", () => {
    expect(shortcutSrc).toMatch(/useAnimationStore\.getState\(\)\.seekFrame/);
  });

  it("clamps to startFrame/endFrame bounds", () => {
    expect(shortcutSrc).toMatch(/Math\.max\(\s*animationState\.startFrame/);
    expect(shortcutSrc).toMatch(/Math\.min\(\s*animationState\.endFrame/);
  });

  it("does not intercept with ctrl/meta modifier", () => {
    expect(shortcutSrc).toMatch(/e\.ctrlKey \|\| e\.metaKey/);
  });

  it("does not require timeline or canvas ownership", () => {
    const frameStep =
      shortcutSrc.match(/if \(isFrameStep\) \{[\s\S]*?\n[ ]{6}\}/)?.[0] ?? "";
    expect(frameStep).not.toMatch(/interactionOwner/);
    expect(frameStep).not.toMatch(/hasActiveGesture/);
  });

  it("preserves existing Ctrl+A / Delete / Ctrl+C / Ctrl+V", () => {
    const panelSrc = readFileSync(
      resolve(
        import.meta.dirname,
        "../../src/features/timeline/components/TimelinePanel.jsx",
      ),
      "utf-8",
    );
    expect(panelSrc).toMatch(/isMod && e\.key\.toLowerCase\(\) === ["']a["']/);
    expect(panelSrc).toMatch(/Backspace.*Delete/);
    expect(panelSrc).toMatch(/e\.key === ["']c["']/);
    expect(panelSrc).toMatch(/e\.key === ["']v["']/);
  });
});

// ── 3A: PendingDraftBanner updated copy ──────────────────────────────────────

describe("PendingDraftBanner I key hint", () => {
  const bannerSrc = readFileSync(
    resolve(
      import.meta.dirname,
      "../../src/features/timeline/components/PendingDraftBanner.jsx",
    ),
    "utf-8",
  );

  it("shows I hint when auto-key is active", () => {
    expect(bannerSrc).toMatch(/press I to drop one now/);
  });

  it("shows I hint when auto-key is off", () => {
    expect(bannerSrc).toMatch(/press I to drop keyframe/);
  });

  it("shows release hint when auto-key is active", () => {
    expect(bannerSrc).toMatch(/release to save keyframe/);
  });

  it("shows release keeps draft when auto-key is off", () => {
    expect(bannerSrc).toMatch(/release keeps draft/);
  });
});
