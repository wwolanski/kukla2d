// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.jsx";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.jsx";

const roots = [];

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.innerHTML = "";
});

async function flushRadixEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function dispatchOutsidePointerDown() {
  const event = new Event("pointerdown", { bubbles: true });
  Object.defineProperty(event, "button", { value: 0 });
  act(() => document.body.dispatchEvent(event));
}

function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(element));
}

describe("DialogContent", () => {
  it("does not dismiss when the pointer is pressed outside", async () => {
    const onOpenChange = vi.fn();

    mount(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Editor dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    await flushRadixEffects();

    dispatchOutsidePointerDown();

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"][data-state="open"]')).not.toBeNull();
  });

  it("keeps the parent dialog open when a confirmation dialog is nested", async () => {
    const onParentOpenChange = vi.fn();

    mount(
      <Dialog open onOpenChange={onParentOpenChange}>
        <DialogContent>
          <DialogTitle>Save project</DialogTitle>
          <AlertDialog open onOpenChange={vi.fn()}>
            <AlertDialogContent>
              <AlertDialogTitle>Overwrite project?</AlertDialogTitle>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
            </AlertDialogContent>
          </AlertDialog>
        </DialogContent>
      </Dialog>,
    );
    await flushRadixEffects();

    dispatchOutsidePointerDown();

    expect(onParentOpenChange).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"][data-state="open"]')).not.toBeNull();
    expect(document.querySelector('[role="alertdialog"][data-state="open"]')).not.toBeNull();
  });
});
