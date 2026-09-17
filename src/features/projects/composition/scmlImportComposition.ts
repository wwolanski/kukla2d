import { convertScmlToProject as convertScmlDocument } from "@/features/projects/infrastructure/externalImport/scml/convertScml.js";
import { parseScml as parseScmlDocument } from "@/features/projects/infrastructure/externalImport/scml/parseScml.js";

export function parseScml(source: string): ReturnType<typeof parseScmlDocument> {
  return parseScmlDocument(source);
}

export function convertScmlToProject(
  ...args: Parameters<typeof convertScmlDocument>
): ReturnType<typeof convertScmlDocument> {
  return convertScmlDocument(...args);
}
