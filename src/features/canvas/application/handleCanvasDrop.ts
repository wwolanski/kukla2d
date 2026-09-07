import { readLibraryAssetDrag } from "@/domain/libraryAssetDrag.js";

import type { WorkflowEvent } from "@/features/canvas/domain/workflowContracts.types.js";

import type { CanvasDropEvent } from "./handleCanvasDrop.types.js";

interface CanvasDropDependencies {
  event: CanvasDropEvent;
  importFiles: (files: FileList) => Promise<unknown>;
  placeLibraryAsset: (
    assetId: string,
    event: CanvasDropEvent,
  ) => Promise<unknown>;
  sendWorkflowEvent?: (event: WorkflowEvent) => void;
}

export async function handleCanvasDrop({
  event,
  importFiles,
  placeLibraryAsset,
  sendWorkflowEvent,
}: CanvasDropDependencies): Promise<void> {
  if (!event.dataTransfer) return;
  event.preventDefault();
  const assetId = readLibraryAssetDrag(event.dataTransfer);
  if (assetId) {
    await placeLibraryAsset(assetId, event);
    return;
  }
  sendWorkflowEvent?.({ type: "DROP_FILES" });
  try {
    await importFiles(event.dataTransfer.files);
    sendWorkflowEvent?.({ type: "IMPORT_DONE" });
  } catch (err) {
    console.error("Failed to import file(s):", err);
    sendWorkflowEvent?.({ type: "IMPORT_FAILED" });
  }
}
