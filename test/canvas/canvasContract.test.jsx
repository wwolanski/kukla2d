// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { EditorWorkflowContext } from "@/features/canvas/application/EditorWorkflowContext.js";
import { useEditorStore } from "@/store/editorStore";

// Mock the PSD importer so the canvas module doesn't try to parse a real file.
vi.mock("@/io/psd.js", () => ({
  importPsd: vi.fn(async () => ({ width: 100, height: 100, layers: [] })),
}));

// Mock the project file I/O to avoid hitting FileReader/blob in jsdom.
vi.mock("@/io/projectFile", () => ({
  saveProject: vi.fn(() => ({ blob: new Blob(), fileName: "a.kk2d" })),
  loadProject: vi.fn(async () => ({ project: {} })),
}));

// Provide a stub ThemeContext so useTheme() resolves without a real provider.
vi.mock("@/app/providers/theme/useTheme.js", () => ({
  useTheme: () => ({
    theme: "dark",
    setTheme: () => {},
    resolvedTheme: "dark",
  }),
}));

import { CanvasViewport } from "@/features/canvas";

function renderInto(node, element) {
  const root = createRoot(node);
  act(() => {
    root.render(element);
  });
  return root;
}

function withProvider(element) {
  return React.createElement(EditorWorkflowContext.Provider, null, element);
}

function makeRefs() {
  return {
    remeshRef: { current: null },
    deleteMeshRef: { current: null },
    saveRef: { current: null },
    loadRef: { current: null },
    resetRef: { current: null },
    exportCaptureRef: { current: null },
    thumbCaptureRef: { current: null },
  };
}

function mountViewport() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  renderInto(
    container,
    withProvider(React.createElement(CanvasViewport, makeRefs())),
  );
  return container;
}

describe("CanvasViewport contract baseline", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders a canvas element on mount", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const refs = {
      remeshRef: { current: null },
      deleteMeshRef: { current: null },
      saveRef: { current: null },
      loadRef: { current: null },
      resetRef: { current: null },
      exportCaptureRef: { current: null },
      thumbCaptureRef: { current: null },
    };
    renderInto(
      container,
      withProvider(React.createElement(CanvasViewport, refs)),
    );
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeTruthy();
  });

  it("accepts all seven imperative refs from EditorLayout", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const refs = {
      remeshRef: { current: null },
      deleteMeshRef: { current: null },
      saveRef: { current: null },
      loadRef: { current: null },
      resetRef: { current: null },
      exportCaptureRef: { current: null },
      thumbCaptureRef: { current: null },
    };
    renderInto(
      container,
      withProvider(React.createElement(CanvasViewport, refs)),
    );
    expect(container.querySelector("canvas")).toBeTruthy();
  });

  it("sets imperative refs to functions after mount (remeshRef, deleteMeshRef, saveRef, loadRef, resetRef, exportCaptureRef, thumbCaptureRef)", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const refs = {
      remeshRef: { current: null },
      deleteMeshRef: { current: null },
      saveRef: { current: null },
      loadRef: { current: null },
      resetRef: { current: null },
      exportCaptureRef: { current: null },
      thumbCaptureRef: { current: null },
    };
    renderInto(
      container,
      withProvider(React.createElement(CanvasViewport, refs)),
    );
    expect(typeof refs.remeshRef.current).toBe("function");
    expect(typeof refs.deleteMeshRef.current).toBe("function");
    expect(typeof refs.saveRef.current).toBe("function");
    expect(typeof refs.loadRef.current).toBe("function");
    expect(typeof refs.resetRef.current).toBe("function");
    expect(typeof refs.exportCaptureRef.current).toBe("function");
    expect(typeof refs.thumbCaptureRef.current).toBe("function");
  });

  it("accepts kk2d project files in hidden file input", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const refs = {
      remeshRef: { current: null },
      deleteMeshRef: { current: null },
      saveRef: { current: null },
      loadRef: { current: null },
      resetRef: { current: null },
      exportCaptureRef: { current: null },
      thumbCaptureRef: { current: null },
    };
    renderInto(
      container,
      withProvider(React.createElement(CanvasViewport, refs)),
    );
    const input = container.querySelector('input[type="file"]');
    expect(input.getAttribute("accept")).toBe(".kk2d,.psd,image/*");
  });
});

describe("Canvas feature API", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("importing named CanvasViewport from @/features/canvas renders the same canvas", async () => {
    const mod = await import("@/features/canvas/index.js");
    const FeatureViewport = mod.CanvasViewport;
    expect(typeof FeatureViewport).toBe("function");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const refs = {
      remeshRef: { current: null },
      deleteMeshRef: { current: null },
      saveRef: { current: null },
      loadRef: { current: null },
      resetRef: { current: null },
      exportCaptureRef: { current: null },
      thumbCaptureRef: { current: null },
    };
    renderInto(
      container,
      withProvider(React.createElement(FeatureViewport, refs)),
    );
    expect(container.querySelector("canvas")).toBeTruthy();
  });
});

describe("Canvas workspace visuals (Stage 21-02)", () => {
  beforeEach(() => {
    useEditorStore.setState({
      canvasBackground: "neutral",
      editorMode: "staging",
      exportAreaMoveMode: false,
      exportAreaPopoverRequest: 0,
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders background, armature, and export-area toggles with aria attributes", () => {
    const container = mountViewport();
    const switcher = container.querySelector("[data-bg-switcher]");
    expect(switcher).toBeTruthy();
    const buttons = switcher.querySelectorAll("button");
    expect(buttons.length).toBe(5);
    for (const btn of buttons) {
      expect(btn.getAttribute("aria-label")).toBeTruthy();
      expect(btn.getAttribute("aria-pressed")).toBeTruthy();
    }
    expect(
      switcher.querySelector('[aria-label="Toggle export area"]'),
    ).toBeTruthy();
  });

  it("shows move instructions and Save action while Export Area tool is active", () => {
    const container = mountViewport();
    const requestBefore = useEditorStore.getState().exportAreaPopoverRequest;
    act(() => useEditorStore.getState().setExportAreaMoveMode(true));
    const controls = container.querySelector(
      '[data-export-area-move-controls="true"]',
    );
    expect(controls).toBeTruthy();
    expect(controls.textContent).toContain("drag the dashed box");
    const save = [...controls.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Save",
    );
    act(() => save.click());
    expect(useEditorStore.getState().exportAreaMoveMode).toBe(false);
    expect(useEditorStore.getState().exportAreaPopoverRequest).toBe(
      requestBefore + 1,
    );
  });

  it("defaults to neutral background", () => {
    const container = mountViewport();
    const surface = container.querySelector("[data-canvas-surface]");
    expect(surface.getAttribute("data-canvas-background")).toBe("neutral");
  });

  it("renders background controls as matching visual previews", () => {
    const container = mountViewport();
    const previews = container.querySelectorAll("[data-bg-preview]");
    expect(previews).toHaveLength(3);
    expect(
      container.querySelector('[data-bg-preview="checker"]').style
        .backgroundImage,
    ).toContain("repeating-conic-gradient");
    expect(
      container.querySelector('[data-bg-preview="white"]').style
        .backgroundColor,
    ).toBe("rgb(255, 255, 255)");
    expect(
      container.querySelector('[data-bg-preview="neutral"]').style
        .backgroundColor,
    ).toBe("rgb(26, 26, 26)");
  });

  it("shows staging outline when editorMode is staging", () => {
    const container = mountViewport();
    const surface = container.querySelector("[data-canvas-surface]");
    expect(surface.getAttribute("data-editor-mode")).toBe("staging");
    expect(surface.style.outline).toBeTruthy();
  });

  it("does not show staging frame when editorMode is animation", () => {
    useEditorStore.setState({ editorMode: "animation" });
    const container = mountViewport();
    const surface = container.querySelector("[data-canvas-surface]");
    expect(surface.getAttribute("data-editor-mode")).toBe("animation");
    expect(surface.style.outline).toBeFalsy();
  });

  it("switches background when button is clicked", () => {
    const container = mountViewport();
    const buttons = container.querySelectorAll("[data-bg-switcher] button");
    const whiteBtn = Array.from(buttons).find((b) =>
      b.getAttribute("aria-label").toLowerCase().includes("white"),
    );
    expect(whiteBtn).toBeTruthy();
    act(() => {
      whiteBtn.click();
    });
    const surface = container.querySelector("[data-canvas-surface]");
    expect(surface.getAttribute("data-canvas-background")).toBe("white");
  });

  it("prevents native context menu on canvas", () => {
    const container = mountViewport();
    const canvas = container.querySelector("canvas");
    const event = new Event("contextmenu", { bubbles: true, cancelable: true });
    const prevented = !canvas.dispatchEvent(event);
    expect(prevented).toBe(true);
  });

  it("does not render CanvasSelectionMenu", () => {
    const container = mountViewport();
    expect(container.querySelector("[data-canvas-selection-menu]")).toBeNull();
  });

  it("background layer is rendered under the canvas", () => {
    const container = mountViewport();
    const bgLayer = container.querySelector("[data-canvas-bg-layer]");
    expect(bgLayer).toBeTruthy();
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeTruthy();
  });
});
