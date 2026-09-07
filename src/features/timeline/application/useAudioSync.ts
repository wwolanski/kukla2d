// Web Audio API playback sync. Watches only isPlaying / activeAnimationId / loopCount; currentTime is read via ref.
import { useRef, useCallback, useEffect } from "react";

import type { Animation } from "@kukla2d/contracts";

interface AudioPlaybackSession {
  currentTimeMs: number;
  playing: boolean;
  activeAnimationId: string | null;
  loopSignal: number;
}

export function useAudioSync(
  animation: Animation | null,
  session: AudioPlaybackSession,
): void {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef(new Map<string, AudioBuffer>());
  const sourcesRef = useRef(new Map<string, AudioBufferSourceNode>());
  const animationRef = useRef<Animation | null>(animation);
  const currentTimeRef = useRef(session.currentTimeMs);

  // Update refs every render so effects always read the latest values
  animationRef.current = animation;
  currentTimeRef.current = session.currentTimeMs;

  // ── 1. Decode buffers when new tracks with audio appear ───────────────
  //    Stable dep: track IDs + sourceUrls joined — avoids object identity churn
  const trackSourceKey = (animation?.audioTracks ?? [])
    .map((t) => `${t.id}:${t.sourceUrl ?? ""}`)
    .join("|");

  useEffect(() => {
    const tracks = animationRef.current?.audioTracks ?? [];
    if (!tracks.length) return;

    let ctx = audioCtxRef.current;
    if (!ctx) {
      ctx = new AudioContext();
      audioCtxRef.current = ctx;
    }

    const abortController = new AbortController();
    let cancelled = false;

    const loadTrack = async (
      track: NonNullable<Animation["audioTracks"]>[number],
    ): Promise<void> => {
      if (!track.sourceUrl || buffersRef.current.has(track.id)) return;

      try {
        const response = await fetch(track.sourceUrl, {
          signal: abortController.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const audioData = await response.arrayBuffer();
        const buffer = await ctx.decodeAudioData(audioData);
        if (!cancelled) buffersRef.current.set(track.id, buffer);
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error(`Audio decode error (${track.id}):`, error);
        }
      }
    };

    for (const track of tracks) {
      void loadTrack(track);
    }

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [trackSourceKey]);

  // ── 2. Stop helper ─────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    sourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        /* source already stopped */
      }
    });
    sourcesRef.current.clear();
  }, []);

  // ── 3. Play/stop — ONLY fires on isPlaying toggle or animation switch ──
  //    animation object intentionally NOT in deps (object ref changes every frame
  //    during drags/updates and would cause runaway restarts). Read via ref instead.
  useEffect(() => {
    if (!session.playing) {
      stopAll();
      return;
    }

    const tracks = animationRef.current?.audioTracks ?? [];
    if (!tracks.length) return;

    let ctx = audioCtxRef.current;
    if (!ctx) {
      ctx = new AudioContext();
      audioCtxRef.current = ctx;
    }

    let cancelled = false;

    const startAll = async (): Promise<void> => {
      if (ctx.state === "suspended") await ctx.resume();
      if (cancelled) return;
      stopAll();

      const nowMs = currentTimeRef.current;

      for (const track of tracks) {
        if (!track.sourceUrl) continue;
        const buffer = buffersRef.current.get(track.id);
        if (!buffer) continue;

        const audioStartMs = track.audioStartMs ?? 0;
        const audioEndMs = track.audioEndMs ?? buffer.duration * 1000;
        const timelineStartMs = track.timelineStartMs ?? 0;
        const timelineEndMs = timelineStartMs + (audioEndMs - audioStartMs);

        if (nowMs >= timelineEndMs) continue;

        const offsetInAudioMs = Math.max(
          0,
          audioStartMs + Math.max(0, nowMs - timelineStartMs),
        );
        if (offsetInAudioMs >= audioEndMs) continue;

        const playDurationSec = (audioEndMs - offsetInAudioMs) / 1000;
        const delaySec = Math.max(0, (timelineStartMs - nowMs) / 1000);

        try {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(
            ctx.currentTime + delaySec,
            offsetInAudioMs / 1000,
            playDurationSec,
          );
          if (cancelled) {
            source.stop();
            continue;
          }
          sourcesRef.current.set(track.id, source);
        } catch (e) {
          console.error(`Audio start error (${track.id}):`, e);
        }
      }
    };

    void startAll().catch((error) => {
      if (!cancelled) console.error("Audio playback start error:", error);
    });
    return () => {
      cancelled = true;
      stopAll();
    };
    // loopCount increments in animationStore.tick on each loop — causes audio restart from top
  }, [session.playing, session.activeAnimationId, session.loopSignal, stopAll]); // NOT animation, NOT currentTime
}
