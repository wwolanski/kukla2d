import { AudioTrackRow } from "./AudioTrackRow.jsx";

export function AudioTrackList({
  decodeAudioFile,
  tracks,
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
  return (
    <>
      {tracks.map((audioTrack) => (
        <AudioTrackRow
          decodeAudioFile={decodeAudioFile}
          key={audioTrack.id}
          track={audioTrack}
          animationId={animationId}
          timelineDurationMs={timelineDurationMs}
          updateAudioTrack={updateAudioTrack}
          removeAudioTrack={removeAudioTrack}
          beginAudioTrackGesture={beginAudioTrackGesture}
          endAudioTrackGesture={endAudioTrackGesture}
          xToFrame={xToFrame}
          startFrame={startFrame}
          totalFrames={totalFrames}
          fps={fps}
        />
      ))}
    </>
  );
}
