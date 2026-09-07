import type { Container, FederatedPointerEvent } from "pixi.js";

interface PixiInteractionEventHandlers {
  pointerDown: (event: FederatedPointerEvent) => void;
  pointerMove: (event: FederatedPointerEvent) => void;
  pointerUp: (event: FederatedPointerEvent) => void;
  pointerUpOutside: (event: FederatedPointerEvent) => void;
  pointerCancel: () => void;
  pointerLeave: () => void;
  windowBlur: () => void;
}

export function bindPixiInteractionEvents(
  stage: Container | null | undefined,
  screen: unknown,
  handlers: PixiInteractionEventHandlers,
): () => void {
  let disposed = false;
  if (stage && typeof stage.on === "function") {
    stage.eventMode = "static";
    if (screen) stage.hitArea = screen as NonNullable<Container["hitArea"]>;
    stage.on("pointerdown", handlers.pointerDown);
    stage.on("globalpointermove", handlers.pointerMove);
    stage.on("pointerup", handlers.pointerUp);
    stage.on("pointerupoutside", handlers.pointerUpOutside);
    stage.on("pointercancel", handlers.pointerCancel);
    stage.on("pointerleave", handlers.pointerLeave);
  }
  if (typeof window !== "undefined")
    window.addEventListener("blur", handlers.windowBlur);
  return () => {
    if (disposed) return;
    disposed = true;
    if (stage && typeof stage.off === "function") {
      stage.off("pointerdown", handlers.pointerDown);
      stage.off("globalpointermove", handlers.pointerMove);
      stage.off("pointerup", handlers.pointerUp);
      stage.off("pointerupoutside", handlers.pointerUpOutside);
      stage.off("pointercancel", handlers.pointerCancel);
      stage.off("pointerleave", handlers.pointerLeave);
    }
    if (typeof window !== "undefined")
      window.removeEventListener("blur", handlers.windowBlur);
  };
}
