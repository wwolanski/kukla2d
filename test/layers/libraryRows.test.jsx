// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { LibraryAssetRow } from "@/features/layers/components/rows/LibraryAssetRow.jsx";
import { LibraryTab } from "@/features/layers/components/LibraryTab.jsx";
import { LibraryFolderRow } from "@/features/layers/components/rows/LibraryFolderRow.jsx";

function mount(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));

  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function dispatchDragEvent(element, type) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      effectAllowed: "move",
      setDragImage: vi.fn(),
    },
  });
  act(() => element.dispatchEvent(event));
}

function openContextMenu(container) {
  const row = container.querySelector("[draggable]");
  expect(row).not.toBeNull();
  act(() => {
    row.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        button: 2,
        clientX: 20,
        clientY: 20,
      }),
    );
  });
}

const baseAsset = {
  id: "head-asset",
  name: "Head",
  sourceFileName: "head.png",
  texture: {},
  isInUse: false,
  size: 1024,
  modularSpriteId: "sprite-1",
  modularKind: "part",
  partKey: "head",
};

const sharedAssetProps = {
  isSelected: false,
  dragSession: null,
  depth: 1,
  onSelect: vi.fn(),
  onRename: vi.fn(),
  onRemove: vi.fn(),
  onDragStart: vi.fn(),
  onDragOver: vi.fn(),
  onDrop: vi.fn(),
};

describe("library sidebar rows", () => {
  it("allows package-part dragging and renders an icon-only badge", () => {
    const onDragStart = vi.fn();
    const onDragOver = vi.fn();
    const onDrop = vi.fn();
    const view = mount(
      <LibraryAssetRow
        {...sharedAssetProps}
        asset={baseAsset}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
      />,
    );

    const row = view.container.querySelector('[draggable="true"]');
    expect(row).not.toBeNull();
    expect(row.textContent).not.toContain("Package Part");

    const badge = view.container.querySelector('[aria-label="Package part"]');
    expect(badge).not.toBeNull();
    expect(badge.getAttribute("title")).toBe("Package part");
    expect(badge.querySelector("svg")).not.toBeNull();

    dispatchDragEvent(row, "dragstart");
    dispatchDragEvent(row, "dragover");
    dispatchDragEvent(row, "drop");
    expect(onDragStart).toHaveBeenCalled();
    expect(onDragOver).toHaveBeenCalledWith("asset", "head-asset", "inside");
    expect(onDrop).toHaveBeenCalledWith("asset", "head-asset");

    view.unmount();
  });

  it("shows both removal actions for a package part", async () => {
    const onRemoveFromPackage = vi.fn();
    const onRemove = vi.fn();
    const view = mount(
      <LibraryAssetRow
        {...sharedAssetProps}
        asset={baseAsset}
        onRemove={onRemove}
        onRemoveFromPackage={onRemoveFromPackage}
      />,
    );

    openContextMenu(view.container);
    const menuItems = [...document.body.querySelectorAll('[role="menuitem"]')];
    expect(menuItems.map((item) => item.textContent)).toEqual([
      "Remove from package",
      "Remove from library",
    ]);

    act(() => menuItems[0].click());
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(onRemoveFromPackage).toHaveBeenCalledWith("head-asset");
    expect(onRemove).not.toHaveBeenCalled();

    view.unmount();
  });

  it("keeps package regeneration in the package folder context menu", async () => {
    const onRegenerateModularSprite = vi.fn();
    const view = mount(
      <LibraryFolderRow
        folder={{
          id: "package-folder",
          name: "Hero",
          sourceFileName: null,
          isModularSpritePackage: true,
          modularSpriteId: "sprite-1",
          children: [],
        }}
        isExpanded
        dragSession={null}
        depth={0}
        onToggleExpand={vi.fn()}
        onRename={vi.fn()}
        onRemove={vi.fn()}
        onRegenerateModularSprite={onRegenerateModularSprite}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
      />,
    );

    openContextMenu(view.container);
    const regenerateItem = [...document.body.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.includes("Regenerate package"),
    );
    expect(regenerateItem).not.toBeUndefined();

    act(() => regenerateItem.click());
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(onRegenerateModularSprite).toHaveBeenCalledWith("sprite-1");
    view.unmount();
  });

  it("does not repeat the source filename on a modular package row", () => {
    const view = mount(
      <LibraryFolderRow
        folder={{
          id: "package-folder",
          name: "Hero",
          sourceFileName: "hero.png",
          isModularSpritePackage: true,
          modularSpriteId: "sprite-1",
          children: [],
        }}
        isExpanded
        dragSession={null}
        depth={0}
        onToggleExpand={vi.fn()}
        onRename={vi.fn()}
        onRemove={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
      />,
    );

    expect(view.container.textContent).toContain("Hero");
    expect(view.container.textContent).not.toContain("hero.png");

    view.unmount();
  });

  it("keeps package regeneration available from the modular source context menu", async () => {
    const onRegenerateModularSprite = vi.fn();
    const view = mount(
      <LibraryAssetRow
        {...sharedAssetProps}
        asset={{
          ...baseAsset,
          id: "source-asset",
          name: "Hero Source",
          modularKind: "source",
        }}
        onRegenerateModularSprite={onRegenerateModularSprite}
      />,
    );

    openContextMenu(view.container);
    const generatorItem = [...document.body.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.includes("Regenerate package"),
    );
    expect(generatorItem).not.toBeUndefined();
    expect(document.body.textContent).toContain("Regenerate package");
    expect(document.body.textContent).not.toContain("Remove from package");

    act(() => generatorItem.click());
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(onRegenerateModularSprite).toHaveBeenCalledWith("sprite-1");
    view.unmount();
  });

  it("routes drops anywhere inside a package to the package container", () => {
    const onDragOver = vi.fn();
    const onDrop = vi.fn();
    const view = mount(
      <LibraryTab
        tree={[
          {
            kind: "folder",
            id: "package-folder",
            name: "Hero",
            sourceFileName: null,
            isModularSpritePackage: true,
            modularSpriteId: "sprite-1",
            children: [{ ...baseAsset, kind: "asset" }],
          },
        ]}
        expandedFolderIds={new Set(["package-folder"])}
        dragSession={{
          sourceKind: "libraryAsset",
          sourceId: "loose-asset",
          targetKind: "folder",
          targetId: "package-folder",
          dropPosition: "inside",
        }}
        selection={[]}
        dragActive
        onDragOverRow={onDragOver}
        onDropRow={onDrop}
      />,
    );

    const packageContainer = view.container.querySelector(
      '[data-library-package-drop-target="package-folder"]',
    );
    const assetRow = view.container.querySelector('[draggable="true"]');
    expect(packageContainer?.getAttribute("data-drop-active")).toBe("true");
    dispatchDragEvent(assetRow, "dragover");
    dispatchDragEvent(assetRow, "drop");
    expect(onDragOver).toHaveBeenCalledWith("folder", "package-folder", "inside");
    expect(onDrop).toHaveBeenCalledWith("folder", "package-folder");

    view.unmount();
  });

  it("passes package removal through LibraryTab without opening confirmation", async () => {
    const onRemoveFromPackage = vi.fn();
    const view = mount(
      <LibraryTab
        tree={[{ ...baseAsset, kind: "asset" }]}
        expandedFolderIds={new Set()}
        dragSession={null}
        selection={[]}
        dragActive={false}
        onRemoveFromPackage={onRemoveFromPackage}
      />,
    );

    openContextMenu(view.container);
    const removeItem = [...document.body.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.includes("Remove from package"),
    );
    expect(removeItem).not.toBeUndefined();
    act(() => removeItem.click());
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(onRemoveFromPackage).toHaveBeenCalledWith("head-asset");
    expect(document.body.textContent).not.toContain("Remove from library?");

    view.unmount();
  });

  it("uses the confirmation flow for removing a package part from library", async () => {
    const onRemoveAsset = vi.fn();
    const view = mount(
      <LibraryTab
        tree={[{ ...baseAsset, kind: "asset" }]}
        expandedFolderIds={new Set()}
        dragSession={null}
        selection={[]}
        dragActive={false}
        onRemoveAsset={onRemoveAsset}
      />,
    );

    openContextMenu(view.container);
    const removeItem = [...document.body.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.includes("Remove from library"),
    );
    expect(removeItem).not.toBeUndefined();
    act(() => removeItem.click());
    await act(async () => {
      await new Promise((resolve) => globalThis.requestAnimationFrame(resolve));
    });
    expect(document.body.textContent).toContain("Remove from library?");
    expect(onRemoveAsset).not.toHaveBeenCalled();

    view.unmount();
  });

  it("does not expose package removal from a modular source context menu", () => {
    const view = mount(
      <LibraryAssetRow
        {...sharedAssetProps}
        asset={{
          ...baseAsset,
          id: "source-asset",
          name: "Hero Source",
          modularKind: "source",
        }}
        onRegenerateModularSprite={vi.fn()}
      />,
    );

    openContextMenu(view.container);
    expect(document.body.textContent).not.toContain("Remove from package");
    view.unmount();
  });
});
