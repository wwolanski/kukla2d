import { LoadModalView } from "@/features/projects/components/LoadModal.jsx";
import {
  externalImportFormats,
  importExternalProject,
} from "@/features/projects/infrastructure/externalImport/index.js";

export function LoadModal(props) {
  return (
    <LoadModalView
      {...props}
      externalImportFormats={externalImportFormats}
      importExternalProject={importExternalProject}
    />
  );
}
