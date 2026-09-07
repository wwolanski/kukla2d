import type { ProjectDocument } from "@kukla2d/contracts";

import type { EditorCommand } from "@/features/canvas/domain/workflowContracts.types.js";

import type {
  CanvasAnimationRuntimePort,
  CanvasDraftPoseValue,
} from "../../../application/canvasRenderer.types.js";
import type { RefObject } from "react";

interface GestureSnapshotPort {
  projectRef: RefObject<ProjectDocument>;
  animationRef: RefObject<CanvasAnimationRuntimePort>;
  _executeCommand(command: EditorCommand): void;
}

export class PixiGestureSnapshot {
  private projectSnapshot: ProjectDocument | null = null;
  private draftPoseSnapshot: Map<string, CanvasDraftPoseValue> | null = null;
  private draftContextSnapshot: CanvasAnimationRuntimePort["draftContext"] =
    null;
  private draftDirtySnapshot: boolean | null = null;
  private draftRevisionSnapshot: number | null = null;

  capture(port: GestureSnapshotPort): void {
    if (this.projectSnapshot) return;
    this.projectSnapshot = structuredClone(port.projectRef.current);
    this.draftPoseSnapshot = structuredClone(
      port.animationRef.current?.draftPose ?? new Map(),
    );
    const animation = port.animationRef.current;
    this.draftContextSnapshot = animation?.draftContext ?? null;
    this.draftDirtySnapshot = animation?.draftDirty ?? false;
    this.draftRevisionSnapshot = animation?.draftRevision ?? 0;
  }

  restore(port: GestureSnapshotPort): void {
    if (this.projectSnapshot) {
      const projectSnapshot = this.projectSnapshot;
      port._executeCommand({
        type: "updateProject",
        payload: {
          mutator: (project) =>
            Object.assign(project, structuredClone(projectSnapshot)),
        },
      });
    }
    const animation = port.animationRef.current;
    if (animation?.clearDraftPose && this.draftPoseSnapshot) {
      animation.clearDraftPose();
      for (const [nodeId, pose] of this.draftPoseSnapshot)
        animation.setDraftPose(nodeId, pose);
    }
    if (animation?.setDraftContext && this.draftContextSnapshot !== undefined) {
      animation.setDraftContext(this.draftContextSnapshot);
    }
    if (
      this.draftDirtySnapshot !== null &&
      this.draftRevisionSnapshot !== null
    ) {
      animation?.restoreDraftMetadata(
        this.draftDirtySnapshot,
        this.draftRevisionSnapshot,
      );
    }
    this.clear();
  }

  clear(): void {
    this.projectSnapshot = null;
    this.draftPoseSnapshot = null;
    this.draftContextSnapshot = null;
    this.draftDirtySnapshot = null;
    this.draftRevisionSnapshot = null;
  }
}
