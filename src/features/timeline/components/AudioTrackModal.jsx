/* eslint-disable react-refresh/only-export-components */
import { Music } from 'lucide-react';
import { useState, useEffect } from 'react';

import { MAX_NAME_LENGTH } from '@/domain/nameConstraints.js';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Slider } from '@/components/ui/slider.jsx';

export function buildAudioTrackPatch({ name, startOffset, audioStartMs, duration }) {
  return {
    name: name || 'Untitled Audio',
    timelineStartMs: Math.round(Math.max(0, startOffset)),
    audioStartMs: Math.round(Math.max(0, audioStartMs)),
    audioEndMs: Math.round(Math.max(audioStartMs + 100, audioStartMs + duration)),
  };
}

export function AudioTrackModal({
  track,
  animationId,
  timelineDurationMs,
  updateAudioTrack,
  isOpen,
  onClose,
}) {
  const [name, setName] = useState(track.name);
  const [startOffset, setStartOffset] = useState(track.timelineStartMs);
  const [audioStartMs, setAudioStartMs] = useState(track.audioStartMs ?? 0);
  const [duration, setDuration] = useState((track.audioEndMs ?? track.audioDurationMs) - (track.audioStartMs ?? 0));

  useEffect(() => {
    if (isOpen) {
      setName(track.name);
      setStartOffset(track.timelineStartMs);
      setAudioStartMs(track.audioStartMs ?? 0);
      setDuration((track.audioEndMs ?? track.audioDurationMs) - (track.audioStartMs ?? 0));
    }
  }, [isOpen, track]);

  const handleSave = () => {
    updateAudioTrack({
      animationId,
      audioTrackId: track.id,
      patch: buildAudioTrackPatch({ name, startOffset, audioStartMs, duration }),
    });
    onClose();
  };

  const maxAudio = track.audioDurationMs ?? 0;
  const timelineEndMs = timelineDurationMs ?? 2000;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card border-border shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Music className="w-5 h-5 text-primary" />
            <span>Audio Settings</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold tracking-tight">Track Name</Label>
            <Input
              value={name}
              maxLength={MAX_NAME_LENGTH}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Background Music"
              className="h-9 font-medium"
            />
          </div>

          <div className="border-t border-border/50 my-2" />

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-semibold tracking-tight">Timeline Start</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  value={Number((startOffset / 1000).toFixed(2))}
                  onChange={e => setStartOffset((parseFloat(e.target.value) || 0) * 1000)}
                  className="w-24 h-8 text-right font-mono"
                />
                <span className="text-xs text-muted-foreground uppercase font-medium">s</span>
              </div>
            </div>
            <Slider
              min={0}
              max={timelineEndMs}
              step={1}
              value={[startOffset]}
              onValueChange={([v]) => setStartOffset(v)}
              className="py-1"
            />
            <p className="text-[10px] text-muted-foreground italic">Where on the animation timeline the audio begins.</p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-semibold tracking-tight">Audio Clip Start</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  value={Number((audioStartMs / 1000).toFixed(2))}
                  onChange={e => setAudioStartMs((parseFloat(e.target.value) || 0) * 1000)}
                  className="w-24 h-8 text-right font-mono"
                />
                <span className="text-xs text-muted-foreground uppercase font-medium">s</span>
              </div>
            </div>
            <Slider
              min={0}
              max={Math.max(maxAudio - 100, 0)}
              step={1}
              value={[audioStartMs]}
              onValueChange={([v]) => {
                const newVal = v;
                setAudioStartMs(newVal);
                if (newVal + duration > maxAudio) {
                  setDuration(maxAudio - newVal);
                }
              }}
              className="py-1"
            />
            <p className="text-[10px] text-muted-foreground italic">Trim from the beginning of the source audio file.</p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-semibold tracking-tight">Play Duration</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  value={Number((duration / 1000).toFixed(2))}
                  onChange={e => setDuration((parseFloat(e.target.value) || 0.1) * 1000)}
                  className="w-24 h-8 text-right font-mono"
                />
                <span className="text-xs text-muted-foreground uppercase font-medium">s</span>
              </div>
            </div>
            <Slider
              min={100}
              max={Math.max(maxAudio - audioStartMs, 100)}
              step={1}
              value={[duration]}
              onValueChange={([v]) => setDuration(v)}
              className="py-1"
            />
            <p className="text-[10px] text-muted-foreground italic">Total time this audio clip will play for.</p>
          </div>

          <div className="p-3 bg-muted/40 rounded-lg border border-border/50 space-y-2">
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Source Duration</span>
              <span className="font-mono">{(maxAudio / 1000).toFixed(2)} s</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Audio Segment</span>
              <span className="font-mono text-primary">{(audioStartMs / 1000).toFixed(2)} → {((audioStartMs + duration) / 1000).toFixed(2)} s</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Timeline Span</span>
              <span className="font-mono text-primary">{(startOffset / 1000).toFixed(2)} → {((startOffset + duration) / 1000).toFixed(2)} s</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all border border-transparent hover:border-border"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:shadow-[0_0_15px_rgba(var(--primary),0.4)] transition-all"
          >
            Apply Changes
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
