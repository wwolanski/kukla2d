import { Disc, RotateCcw, Repeat, SkipBack, SkipForward, Music } from 'lucide-react';

import { FeatureDisabledTooltip } from '@/components/ui/feature-disabled-tooltip';
import { toast } from '@/components/ui/use-toast';

import { NumField } from './NumField.jsx';
import { TransportButton } from './TransportButton.jsx';
import { buildFpsTimingChange } from '../domain/timelineTime.js';


export function TransportBar({
  animation,
  ensureAnimation,
  setAutoKeyframe,
  autoKeyframe,
  updateTiming,
  timelineMode,
  setTimelineMode: _setTimelineMode,
  onRequestMarker,
  addAudioTrack,
  copyPose,
  canCopyPose,
  pastePose,
  poseClipboard,
  currentFrame,
  startFrame,
  endFrame,
  fps,
  isPlaying,
  loop,
  speed,
  loopKeyframes,
  play,
  pause,
  stop,
  seekFrame,
  setLoop,
  setSpeed,
  setLoopKeyframes,
  setStartFrame,
}) {
  const togglePlay = () => {
    ensureAnimation();
    if (isPlaying) pause();
    else play();
  };

  const lastFrame = () => {
    seekFrame(endFrame);
  };

  const hasAnimation = animation !== null;

  return (
    <div className="flex min-w-0 shrink-0 flex-wrap content-start items-center gap-x-2 gap-y-1 overflow-x-hidden border-b border-border bg-card px-2 py-1">
      <TransportButton disabled={!hasAnimation} onClick={stop} title="First Frame">
        <SkipBack size={14} />
      </TransportButton>

      <TransportButton disabled={!hasAnimation} onClick={togglePlay} active={isPlaying} title={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <rect x="1.5" y="1" width="2.5" height="8" rx="0.5" />
            <rect x="6" y="1" width="2.5" height="8" rx="0.5" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <polygon points="2,1 9,5 2,9" />
          </svg>
        )}
      </TransportButton>

      <TransportButton disabled={!hasAnimation} onClick={lastFrame} title="Last Frame">
        <SkipForward size={14} />
      </TransportButton>

      <TransportButton disabled={!hasAnimation} onClick={() => setLoop(!loop)} active={loop} title="Repeat">
        <Repeat size={14} />
      </TransportButton>

      <div className="w-px h-4 bg-border mx-1" />

      <NumField
        label="Frame"
        value={currentFrame}
        min={startFrame}
        max={endFrame}
        onChange={(v) => seekFrame(v)}
        tip="Zero-based playhead position. Frame 0 is the first frame."
      />
      <NumField
        label="Start"
        value={startFrame}
        min={0}
        max={endFrame - 1}
        onChange={(v) => setStartFrame(v)}
        tip="Inclusive loop start. Frame 0 is the first frame."
      />
      <NumField
        label="End"
        value={endFrame}
        min={startFrame + 1}
        onChange={(v) => {
          if (animation) {
            updateTiming({
              animationId: animation.id,
              durationMs: (v / (animation.fps ?? fps)) * 1000,
              fps: animation.fps ?? fps,
            });
          }
        }}
        tip={`Exclusive end boundary. Range ${startFrame}–${endFrame} contains ${endFrame - startFrame} playable frames: ${startFrame}–${endFrame - 1}.`}
      />

      <div className="w-px h-4 bg-border mx-1" />

      <NumField
        label="FPS"
        value={fps}
        min={1}
        max={120}
        onChange={(v) => {
          const timing = buildFpsTimingChange(animation, v);
          if (timing) updateTiming(timing);
        }}
        tip="Animation sampling rate. Changing FPS preserves duration and keyframe timing."
      />

      <label className="flex items-center gap-1 ml-1" title="Preview-only playback speed. Does not change animation timing or export.">
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">Speed</span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={speed}
          onChange={e => setSpeed(parseFloat(e.target.value))}
          className="w-16 h-1 accent-primary"
        />
        <span className="text-[10px] text-muted-foreground w-6">{speed.toFixed(1)}×</span>
      </label>

      <div className="w-px h-4 bg-border mx-1" />

      <TransportButton
        disabled={!hasAnimation}
        onClick={() => setLoopKeyframes && setLoopKeyframes(!loopKeyframes)}
        active={loopKeyframes}
        title="Loop Keyframes: When active, the animation will interpolate from the last keyframe back to the first keyframe for a seamless loop."
      >
        <RotateCcw size={14} />
      </TransportButton>

      <TransportButton
        disabled={!hasAnimation}
        onClick={() => setAutoKeyframe(!autoKeyframe)}
        active={autoKeyframe}
        className={autoKeyframe ? 'animate-recording' : ''}
        title="Auto Keyframe: Automatically commit values to track when properties are changed"
      >
        <Disc size={14} strokeWidth={2} />
      </TransportButton>

      <TransportButton
        featureDisabled
        onClick={() => {
          const name = window.prompt('Audio track name:', `Audio ${(animation?.audioTracks?.length ?? 0) + 1}`);
          if (name) {
            addAudioTrack({
              animationId: animation.id,
              name,
            });
          }
        }}
        title={!hasAnimation ? "Create an animation first to add audio" : "Add audio track"}
      >
        <Music size={14} />
      </TransportButton>

      <div className="w-px h-4 bg-border mx-1" />

      <FeatureDisabledTooltip>
        <button
          type="button"
          className="text-[10px] px-2 py-1 rounded border border-border opacity-50 cursor-not-allowed transition-colors"
        >
          {timelineMode === 'dope' ? 'Dope' : 'Graph'}
        </button>
      </FeatureDisabledTooltip>
      <button
        disabled={!hasAnimation}
        onClick={onRequestMarker}
        className="text-[10px] px-2 py-1 rounded border border-border hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
        title="Add marker at current frame"
      >
        Marker
      </button>
      <button
        disabled={!hasAnimation || !canCopyPose}
        onClick={() => {
          const result = copyPose();
          if (result?.changed) {
            toast({ description: `Copied pose from Frame ${result.sourceFrame}` });
          }
        }}
        className="text-[10px] px-2 py-1 rounded border border-border hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
        title={canCopyPose
          ? 'Copy all keyframes at current frame'
          : 'No keyframes at current frame'}
      >
        Copy Pose
      </button>
      <button
        disabled={!poseClipboard}
        onClick={() => {
          const result = pastePose(false);
          if (result?.changed) {
            toast({ description: `Pasted pose from memory: Frame ${result.sourceFrame}` });
          }
        }}
        className="text-[10px] px-2 py-1 rounded border border-border hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
        title="Paste copied pose as keyframes at the playhead"
      >
        Paste Pose
      </button>
      <button
        disabled={!poseClipboard}
        onClick={() => {
          const result = pastePose(true);
          if (result?.changed) {
            toast({ description: `Pasted pose from memory: Frame ${result.sourceFrame}` });
          }
        }}
        className="text-[10px] px-2 py-1 rounded border border-border hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
        title="Paste pose with X position and rotation mirrored. Does not reverse keyframes."
        aria-label="Paste Mirrored"
      >
        Paste Mirrored
      </button>

      <span className="flex-1" />

      {animation && (
        <span className="text-[10px] text-muted-foreground truncate max-w-[100px]" title={animation.name}>
          {animation.name}
        </span>
      )}

      {!hasAnimation && (
        <button
          onClick={ensureAnimation}
          className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + New Animation
        </button>
      )}

      <span className="text-[10px] text-muted-foreground border border-border/40 px-1 py-0.5 font-mono" title="Smart K: key existing animated channels. New child bones default to rotation so parent motion stays inherited.">
        K
      </span>
    </div>
  );
}
