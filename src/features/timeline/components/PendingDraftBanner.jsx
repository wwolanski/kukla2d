import { usePendingDraftController } from "@/features/timeline/application/usePendingDraftController.js";

export function PendingDraftBanner() {
  const { visible, autoKeyframe, frame, clipName, commit, discard } =
    usePendingDraftController();
  if (!visible) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/30 text-[11px] shrink-0">
      <span className="text-amber-600 font-medium">
        {autoKeyframe ? "Auto-key preview" : "Pending draft"}
      </span>
      <span className="text-muted-foreground">
        {clipName} @ f{frame}
        {autoKeyframe
          ? " · release to save keyframe · press I to drop one now"
          : " · press I to drop keyframe · release keeps draft"}
      </span>
      <span className="flex-1" />
      {!autoKeyframe && (
        <>
          <button
            onClick={commit}
            className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-medium hover:bg-primary/90 transition-colors"
          >
            Commit
          </button>
          <button
            onClick={discard}
            className="px-2 py-0.5 rounded border border-border text-[10px] font-medium hover:bg-muted transition-colors"
          >
            Discard
          </button>
        </>
      )}
    </div>
  );
}
