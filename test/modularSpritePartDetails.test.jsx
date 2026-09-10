// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/modular-sprite-schema", () => ({
  SchemaEditor: () => null,
}));

vi.mock(
  "@/features/modular-sprite/components/preview/PartThumbnail.js",
  () => ({
    PartThumbnail: () => <div data-testid="part-thumbnail" />,
  }),
);

import { PartDetailsStep } from "@/features/modular-sprite/components/wizard/PartDetailsStep";

function mountPartDetails(onUpdatePart = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <PartDetailsStep
        grouping={{
          parts: [
            {
              partKey: "arm",
              name: "Arm",
              role: "arm",
              side: "none",
              qualifiers: {},
              required: true,
              order: 0,
              extractionFrame: { x: 0, y: 0, width: 1, height: 1 },
              contentBounds: { x: 0, y: 0, width: 1, height: 1 },
              regionIds: [1],
            },
          ],
          excludedRegionIds: [],
        }}
        resultRef={{ current: null }}
        resultVersion={0}
        schema={{
          addSchema: false,
          saveMode: "new",
          metadata: {
            name: "",
            description: "",
            characterTypeIds: [],
            characterClassIds: [],
            tags: [],
          },
          applied: false,
        }}
        onUpdatePart={onUpdatePart}
        onSchemaEditorChange={vi.fn()}
      />,
    );
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function changeInput(input, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  ).set;
  valueSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function buttonWithText(container, text) {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === text,
  );
}

describe("PartDetailsStep", () => {
  it("adds editable attributes, emits qualifiers, and keeps technical controls out of the UI", () => {
    const onUpdatePart = vi.fn();
    const view = mountPartDetails(onUpdatePart);

    const stableKey = view.container.querySelector("input[readonly]");
    expect(stableKey).not.toBeNull();
    expect(stableKey?.value).toBe("arm");
    expect(stableKey?.readOnly).toBe(true);

    expect(buttonWithText(view.container, "Confirm")).toBeUndefined();
    expect(buttonWithText(view.container, "Required")).toBeUndefined();
    expect(buttonWithText(view.container, "Extraction frame")).toBeUndefined();
    expect(buttonWithText(view.container, "Remove part")).toBeUndefined();
    expect(view.container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(view.container.textContent).not.toContain("Extraction frame");
    expect(view.container.textContent).not.toContain("Remove part");

    act(() => {
      buttonWithText(view.container, "Add attribute")?.click();
    });

    const attribute = view.container.querySelector(
      'input[aria-label="Attribute 1"]',
    );
    const value = view.container.querySelector('input[aria-label="Value 1"]');
    expect(attribute).not.toBeNull();
    expect(value).not.toBeNull();
    expect(attribute?.disabled).toBe(false);
    expect(attribute?.readOnly).toBe(false);
    expect(value?.disabled).toBe(false);
    expect(value?.readOnly).toBe(false);

    act(() => {
      changeInput(attribute, "segment");
      changeInput(value, "lower");
    });

    expect(onUpdatePart).toHaveBeenLastCalledWith(0, {
      qualifiers: { segment: "lower" },
    });
    view.unmount();
  });
});
