import { LoadModalView } from "../components/LoadModal.jsx";
import {
  externalImportFormats,
  importExternalProject,
} from "../infrastructure/externalImport/index.js";

export function LoadModal(props) {
  return (
    <LoadModalView
      {...props}
      externalImportFormats={externalImportFormats}
      importExternalProject={importExternalProject}
    />
  );
}
