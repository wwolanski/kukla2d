import type { PhysicsRuntime } from "@/features/canvas/application/evaluateEditorFramePose.types.js";

export interface PosePhysicsLoader {
  load(
    isCurrent: () => boolean,
    onLoaded: (runtime: PhysicsRuntime) => void,
  ): void;
  reset(): void;
}
