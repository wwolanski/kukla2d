import type { PosePhysicsLoader } from "./posePhysicsLoader.types.js";

export function createPosePhysicsLoader(): PosePhysicsLoader {
  let inFlight: Promise<void> | null = null;

  return {
    load(isCurrent, onLoaded) {
      if (inFlight) return;
      inFlight = import("@/runtime/physics/manualPosePhysics.js")
        .then(({ createManualPosePhysicsRuntime }) => {
          if (isCurrent()) onLoaded(createManualPosePhysicsRuntime());
        })
        .catch(() => {
          // Failed dynamic imports must clear the cache so a later frame can retry.
        })
        .finally(() => {
          inFlight = null;
        });
    },
    reset() {
      inFlight = null;
    },
  };
}
