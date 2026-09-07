import type { PhysicsRuntime } from "./evaluateEditorFramePose.types.js";

export interface PosePhysicsLoader {
  load(
    isCurrent: () => boolean,
    onLoaded: (runtime: PhysicsRuntime) => void,
  ): void;
  reset(): void;
}
