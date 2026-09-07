import { Settings, X } from "lucide-react";
import { lazy, Suspense, useRef, useState, useCallback } from "react";

import { LAYOUT } from "../domain/timelineLayout.js";
import { msToFrame, frameToMs } from "../domain/timelineTime.js";

const AudioTrackModal = lazy(async () => {
  const module = await import("./AudioTrackModal.jsx");
  return { default: module.AudioTrackModal };
});

export function AudioTrackRow({
  decodeAudioFile,
  track,
  animationId,
  timelineDurationMs,
  updateAudioTrack,
  removeAudioTrack,
  beginAudioTrackGesture,
  endAudioTrackGesture,
  xToFrame,
  startFrame,
  totalFrames,
  fps,
}) {
  const fileInputRef = useRef(null);
  const [draggingHandle, setDraggingHandle] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const timelineEndMs = timelineDurationMs ?? 2000;

  const handleUpload = async (file) => {
    const result = await decodeAudioFile(file);
    if (result.error) {
      console.error("Failed to decode audio:", result.error);
      URL.revokeObjectURL(result.blobUrl);
      return;
    }

    const audioDurationMs = result.durationMs;
    const clipEndMs = Math.min(audioDurationMs, timelineEndMs);

    updateAudioTrack({
      animationId,
      audioTrackId: track.id,
      patch: {
        sourceUrl: result.blobUrl,
        mimeType: file.type,
        audioDurationMs,
        audioStartMs: 0,
        audioEndMs: clipEndMs,
        timelineStartMs: 0,
      },
    });
  };

  const handleLeftDrag = useCallback(
    (e) => {
      if (!track.sourceUrl) return;
      e.stopPropagation();
      setDraggingHandle("left");
      beginAudioTrackGesture("Move Audio Track");

      const startX = e.clientX;
      const startFramePos = xToFrame(startX);
      const origStart = track.audioStartMs ?? 0;
      const origTimelineStart = track.timelineStartMs ?? 0;

      const handleMove = (ev) => {
        const currentFramePos = xToFrame(ev.clientX);
        const frameDelta = currentFramePos - startFramePos;
        const deltaMs = frameToMs(frameDelta, fps);

        const minDelta = Math.max(-origTimelineStart, -origStart);
        const maxDelta =
          (track.audioEndMs ?? track.audioDurationMs) - origStart - 100;
        const clampedDelta = Math.max(minDelta, Math.min(deltaMs, maxDelta));

        updateAudioTrack({
          animationId,
          audioTrackId: track.id,
          patch: {
            audioStartMs: origStart + clampedDelta,
            timelineStartMs: origTimelineStart + clampedDelta,
          },
        });
      };

      const handleUp = () => {
        endAudioTrackGesture();
        setDraggingHandle(null);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [
      track,
      animationId,
      updateAudioTrack,
      xToFrame,
      fps,
      beginAudioTrackGesture,
      endAudioTrackGesture,
    ],
  );

  const handleRightDrag = useCallback(
    (e) => {
      if (!track.sourceUrl) return;
      e.stopPropagation();
      setDraggingHandle("right");
      beginAudioTrackGesture("Trim Audio Track");

      const startX = e.clientX;
      const startFramePos = xToFrame(startX);
      const origEnd = track.audioEndMs;

      const handleMove = (ev) => {
        const currentFramePos = xToFrame(ev.clientX);
        const frameDelta = currentFramePos - startFramePos;
        const deltaMs = frameToMs(frameDelta, fps);

        const audioStart = track.audioStartMs ?? 0;
        const maxEnd = track.audioDurationMs ?? 0;
        const minEnd = audioStart + 100;
        const clampedEnd = Math.max(
          minEnd,
          Math.min(origEnd + deltaMs, maxEnd),
        );

        updateAudioTrack({
          animationId,
          audioTrackId: track.id,
          patch: {
            audioEndMs: clampedEnd,
          },
        });
      };

      const handleUp = () => {
        endAudioTrackGesture();
        setDraggingHandle(null);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [
      track,
      animationId,
      updateAudioTrack,
      xToFrame,
      fps,
      beginAudioTrackGesture,
      endAudioTrackGesture,
    ],
  );

  const handleBarDrag = useCallback(
    (e) => {
      if (!track.sourceUrl) return;
      e.stopPropagation();
      setDraggingHandle("body");
      beginAudioTrackGesture("Move Audio Track");

      const startX = e.clientX;
      const startFramePos = xToFrame(startX);
      const origStart = track.timelineStartMs ?? 0;

      const handleMove = (ev) => {
        const currentFramePos = xToFrame(ev.clientX);
        const frameDelta = currentFramePos - startFramePos;
        const deltaMs = frameToMs(frameDelta, fps);

        updateAudioTrack({
          animationId,
          audioTrackId: track.id,
          patch: {
            timelineStartMs: Math.max(0, origStart + deltaMs),
          },
        });
      };

      const handleUp = () => {
        endAudioTrackGesture();
        setDraggingHandle(null);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [
      track,
      animationId,
      updateAudioTrack,
      xToFrame,
      fps,
      beginAudioTrackGesture,
      endAudioTrackGesture,
    ],
  );

  const audioDuration = track.audioDurationMs ?? 0;
  const audioStart = track.audioStartMs ?? 0;
  const audioEnd = track.audioEndMs ?? audioDuration;
  const playableMs = audioEnd - audioStart;
  const timelineStart = track.timelineStartMs ?? 0;
  const timelineEnd = timelineStart + playableMs;

  const startFramePos = msToFrame(timelineStart, fps);
  const endFramePos = msToFrame(timelineEnd, fps);
  const leftPercent = ((startFramePos - startFrame) / totalFrames) * 100;
  const rightPercent = ((endFramePos - startFrame) / totalFrames) * 100;

  const deleteTrack = () => {
    removeAudioTrack({
      animationId,
      audioTrackId: track.id,
    });
  };

  return (
    <>
      <div
        className="flex border-b border-border/30 relative text-[11px] bg-muted/5"
        style={{ height: LAYOUT.ROW_H }}
      >
        <div
          className="flex items-center justify-between px-2 border-r border-border/30 shrink-0 text-muted-foreground overflow-hidden sticky left-0 z-30 bg-card/80 backdrop-blur-sm shadow-[1px_0_2px_rgba(0,0,0,0.1)]"
          style={{ width: LAYOUT.LABEL_W, minWidth: LAYOUT.LABEL_W }}
        >
          <span className="truncate text-xs font-medium">{track.name}</span>
          <div className="flex gap-0.5 ml-1">
            <button
              onClick={() => setShowModal(true)}
              className="p-0.5 hover:text-primary transition-colors"
              title="Audio settings"
            >
              <Settings size={12} />
            </button>
            <button
              onClick={deleteTrack}
              className="p-0.5 hover:text-destructive transition-colors"
              title="Delete audio track"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        <div className="relative flex-1 overflow-visible">
          <div
            className="absolute inset-y-0"
            style={{ left: LAYOUT.TRACK_PAD, right: LAYOUT.TRACK_PAD }}
          >
            {!track.sourceUrl ? (
              <div className="flex items-center justify-center h-full">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] px-2 py-1 rounded bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary transition-colors"
                >
                  Upload audio
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                  }}
                  className="hidden"
                />
              </div>
            ) : (
              <div
                onPointerDown={handleBarDrag}
                className="absolute top-1/2 -translate-y-1/2 h-3 bg-primary/30 border border-primary/50 rounded transition-all"
                style={{
                  left: `${leftPercent}%`,
                  right: `${100 - rightPercent}%`,
                  cursor: draggingHandle === "body" ? "grabbing" : "grab",
                }}
                title={`${track.name} — drag to move, drag edges to trim`}
              >
                <div
                  onPointerDown={handleLeftDrag}
                  className="absolute top-0 bottom-0 -left-1 w-2 bg-primary/60 hover:bg-primary cursor-ew-resize rounded-l"
                  style={{
                    cursor:
                      draggingHandle === "left" ? "grabbing" : "ew-resize",
                  }}
                />
                <div
                  onPointerDown={handleRightDrag}
                  className="absolute top-0 bottom-0 -right-1 w-2 bg-primary/60 hover:bg-primary cursor-ew-resize rounded-r"
                  style={{
                    cursor:
                      draggingHandle === "right" ? "grabbing" : "ew-resize",
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <Suspense fallback={null}>
          <AudioTrackModal
            track={track}
            animationId={animationId}
            timelineDurationMs={timelineDurationMs}
            updateAudioTrack={updateAudioTrack}
            isOpen={showModal}
            onClose={() => setShowModal(false)}
          />
        </Suspense>
      )}
    </>
  );
}
