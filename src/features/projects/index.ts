import { lazy } from "react";

export const SaveModal = lazy(() =>
  import("@/features/projects/components/SaveModal.jsx").then(
    ({ SaveModal: Component }) => ({ default: Component }),
  ),
);

export {
  WorkspaceToolbar,
  PoseToolButton,
} from "@/features/projects/components/WorkspaceToolbar.jsx";
export { ToolSettingsBar } from "@/features/projects/components/ToolSettingsBar.jsx";
export { WorkspaceStatus } from "@/features/projects/components/WorkspaceStatus.jsx";
export { useProjectSession } from "@/features/projects/application/useProjectSession.js";
export { publishProjectSchemasToLocalDatabase } from "@/features/projects/composition/projectSchemaPublicationComposition.js";
export { useRecoveryScheduler } from "@/features/projects/application/useRecoveryScheduler.js";
export {
  convertScmlToProject,
  parseScml,
} from "@/features/projects/composition/scmlImportComposition.js";
export { RecoveryPrompt } from "@/features/projects/components/RecoveryPrompt.jsx";
export { LoadModal } from "@/features/projects/composition/projectComposition.jsx";
export { loadExampleProjectFile } from "@/features/projects/composition/exampleProjectComposition.js";
