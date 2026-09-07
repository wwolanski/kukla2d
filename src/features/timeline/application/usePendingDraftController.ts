import { useCallback, useMemo } from "react";

import { useAnimationStore } from "@/store/animationStore";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";

import { createAnimationAuthoringApi } from "@/features/animation";

import { msToFrame } from "../domain/timelineTime.js";

interface PendingDraftController {
  visible: boolean;
  autoKeyframe: boolean;
  clipName: string;
  frame: number;
  commit: () => void;
  discard: () => void;
}

export function usePendingDraftController(): PendingDraftController {
  const draftDirty = useAnimationStore((state) => state.draftDirty);
  const draftPoseSize = useAnimationStore((state) => state.draftPose.size);
  const activeAnimationId = useAnimationStore(
    (state) => state.activeAnimationId,
  );
  const frame = useAnimationStore((state) =>
    msToFrame(state.currentTime, state.fps),
  );
  const autoKeyframe = useEditorStore((state) => state.autoKeyframe);
  const animations = useProjectStore((state) => state.project.animations);
  const activeClip = useMemo(
    () =>
      animations.find((animation) => animation.id === activeAnimationId) ??
      null,
    [activeAnimationId, animations],
  );
  const authoringApi = useMemo(() => createAnimationAuthoringApi(), []);
  const commit = useCallback(() => {
    authoringApi.commit({ source: "navigation-guard" });
  }, [authoringApi]);
  const discard = useCallback(() => authoringApi.discard(), [authoringApi]);

  return {
    visible: draftDirty && draftPoseSize > 0,
    autoKeyframe,
    clipName: activeClip?.name ?? "Untitled",
    frame,
    commit,
    discard,
  };
}
