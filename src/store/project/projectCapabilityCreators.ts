import type { ProjectActions } from "./projectStoreTypes.types.js";

type ProjectCapability = Partial<ProjectActions>;

export function composeProjectCapabilities(
  ...capabilities: ProjectCapability[]
): ProjectActions {
  const composed: ProjectCapability = {};
  for (const capability of capabilities) {
    for (const [methodName, method] of Object.entries(capability)) {
      if (methodName in composed) {
        throw new Error(
          `Duplicate project store capability method: ${methodName}`,
        );
      }
      Object.assign(composed, { [methodName]: method });
    }
  }
  return composed as ProjectActions;
}
