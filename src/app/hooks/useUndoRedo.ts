import { useEffect, useRef } from "react";

import type { ProjectStore } from "@/store/project/projectStoreTypes.types.js";
import { useProjectStore } from "@/store/projectStore";
import { undo, redo, applyPatches } from "@/store/undoHistory";

export function useUndoRedo(): void {
  const projectRef = useRef<ProjectStore | null>(null);

  useEffect(() => {
    return useProjectStore.subscribe((state) => {
      projectRef.current = state;
    });
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isZ = event.key === "z" || event.key === "Z";
      const isY = event.key === "y" || event.key === "Y";
      const ctrl = event.ctrlKey || event.metaKey;

      if (!ctrl) return;

      if (isZ && !event.shiftKey) {
        event.preventDefault();
        undo((inversePatches) => {
          const fullState = useProjectStore.getState();
          const restored = applyPatches(fullState, inversePatches);
          useProjectStore.getState().restoreProject(restored);
        });
      } else if (isY || (isZ && event.shiftKey)) {
        event.preventDefault();
        redo((forwardPatches) => {
          const fullState = useProjectStore.getState();
          const restored = applyPatches(fullState, forwardPatches);
          useProjectStore.getState().restoreProject(restored);
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
