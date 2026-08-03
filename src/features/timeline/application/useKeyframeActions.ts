import { useState, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';

import { type Animation, type AnimationId, type AnimationTargetId, type Track } from '@kukla2d/contracts';

import type { ProjectActions } from '@/store/project/projectStoreTypes';

import type {
  AnimationEasing,
  AnimationKeyframeInput,
} from '@/domain/animationCommandTypes';
import { isTimelineVisibleKeyframe } from '@/domain/keyframeProvenance';

import { uid } from '@/lib/uid.js';

import {
  collectTrackKeyframeAddresses,
  keyframeAddressToString,
  parseKeyframeAddressSet,
} from './keyframeAddress.js';

interface KeyframeClipboard {
  properties: Record<string, unknown>;
  easing: AnimationEasing;
}

interface PoseClipboardEntry {
  id: AnimationTargetId;
  channels: Record<string, {
    value: unknown;
    easing: AnimationEasing;
    role: 'authored' | 'derived';
  }>;
}

interface PoseClipboard {
  entries: PoseClipboardEntry[];
  sourceFrame: number;
}

interface KeyframeActionsOptions {
  animation: Animation | null;
  activeAnimationId: AnimationId | null;
  currentTimeMs: number;
  upsertKeyframes: ProjectActions['upsertAnimationKeyframes'];
  addMarkerIntent: ProjectActions['addAnimationMarker'];
  deleteKeyframes: ProjectActions['deleteAnimationKeyframes'];
  setKeyframeEasing: ProjectActions['setAnimationKeyframeEasing'];
  selectedKeyframes: Set<string>;
  setSelectedKeyframes: Dispatch<SetStateAction<Set<string>>>;
  sel: readonly AnimationTargetId[];
  currentFrame: number;
}

function trackTargetId(track: Track): AnimationTargetId { return track.targetId; }

function getAddressesAtTime(
  animation: Animation | null,
  targetId: AnimationTargetId,
  properties: string | readonly string[] | null,
  timeMs: number,
): string[] {
  if (!animation) return [];
  const propertySet = properties
    ? new Set<string>(typeof properties === 'string' ? [properties] : properties)
    : null;
  return collectTrackKeyframeAddresses(
    animation.tracks.filter(
      (track) => trackTargetId(track) === targetId && (!propertySet || propertySet.has(track.property)),
    ),
    timeMs,
  ).map((address) => keyframeAddressToString(address));
}

function collectPoseClipboardEntriesAtTime(
  animation: Animation | null,
  timeMs: number,
): PoseClipboardEntry[] {
  if (!animation) return [];
  const byTarget = new Map<AnimationTargetId, PoseClipboardEntry>();

  for (const track of animation.tracks) {
    const targetId = trackTargetId(track);
    const keyframe = track.keyframes.find((candidate) => candidate.time === timeMs);
    if (!keyframe) continue;
    const entry = byTarget.get(targetId) ?? { id: targetId, channels: {} };
    entry.channels[track.property] = {
      value: keyframe.value,
      easing: keyframe.easing ?? 'linear',
      role: isTimelineVisibleKeyframe(keyframe) ? 'authored' : 'derived',
    };
    byTarget.set(targetId, entry);
  }

  return Array.from(byTarget.values());
}

function hasAuthoredPoseChannel(entries: readonly PoseClipboardEntry[]): boolean {
  return entries.some((entry) => (
    Object.values(entry.channels).some((channel) => channel.role === 'authored')
  ));
}

function useKeyframeActionsImpl({
  animation,
  activeAnimationId,
  currentTimeMs,
  upsertKeyframes,
  addMarkerIntent,
  deleteKeyframes,
  setKeyframeEasing,
  selectedKeyframes,
  setSelectedKeyframes,
  sel,
  currentFrame,
}: KeyframeActionsOptions) {
  const [clipboard, setClipboard] = useState<KeyframeClipboard | null>(null);
  const [poseClipboard, setPoseClipboard] = useState<PoseClipboard | null>(null);
  const playbackRef = useRef({ currentTimeMs, currentFrame });
  playbackRef.current.currentTimeMs = currentTimeMs;
  playbackRef.current.currentFrame = currentFrame;
  const canCopyPose = hasAuthoredPoseChannel(
    collectPoseClipboardEntriesAtTime(animation, currentTimeMs),
  );

  const copyKeyframe = useCallback((nodeId: AnimationTargetId, timeMs: number) => {
    if (!animation) return;
    const props: Record<string, unknown> = {};
    let easing: AnimationEasing = 'linear';

    for (const track of animation.tracks) {
      if (trackTargetId(track) !== nodeId) continue;
      const kf = track.keyframes.find(k => k.time === timeMs);
      if (kf) {
        props[track.property] = kf.value;
        easing = kf.easing ?? 'linear';
      }
    }

    if (Object.keys(props).length > 0) {
      setClipboard({ properties: props, easing });
    }
  }, [animation]);

  const pasteKeyframes = useCallback(() => {
    if (!clipboard || !animation || !activeAnimationId || sel.length === 0) return;

    const keyframes: AnimationKeyframeInput[] = sel.flatMap((targetId) => (
      Object.entries(clipboard.properties).map(([property, value]) => ({
        targetId,
        property,
        timeMs: playbackRef.current.currentTimeMs,
        value,
        easing: clipboard.easing,
      }))
    ));
    upsertKeyframes({
      animationId: activeAnimationId,
      keyframes,
    });
  }, [clipboard, animation, sel, activeAnimationId, upsertKeyframes]);

  const copyPose = useCallback(() => {
    if (!animation) return { changed: false };
    const entries = collectPoseClipboardEntriesAtTime(animation, playbackRef.current.currentTimeMs);
    if (hasAuthoredPoseChannel(entries)) {
      const sourceFrame = playbackRef.current.currentFrame;
      setPoseClipboard({ entries, sourceFrame });
      return { changed: true, sourceFrame };
    }
    return { changed: false };
  }, [animation]);

  const pastePose = useCallback((mirror = false) => {
    if (!poseClipboard || !animation || !activeAnimationId) return { changed: false };
    const gestureId = `pose-copy-${uid()}`;
    const keyframes = poseClipboard.entries.flatMap((entry) => {
      return Object.entries(entry.channels).map(([property, channel]) => ({
        targetId: entry.id,
        property,
        timeMs: playbackRef.current.currentTimeMs,
        value: mirror
          && (property === 'x' || property === 'rotation')
          && typeof channel.value === 'number'
          ? -channel.value
          : channel.value,
        easing: channel.easing,
        authoring: {
          gestureId,
          role: channel.role,
          source: 'timeline.copy-pose',
        },
      }));
    });
    upsertKeyframes({
      animationId: activeAnimationId,
      keyframes,
    });
    const frame = playbackRef.current.currentFrame;
    return { changed: keyframes.length > 0, sourceFrame: poseClipboard.sourceFrame, targetFrame: frame };
  }, [poseClipboard, animation, upsertKeyframes, activeAnimationId]);

  const addMarker = useCallback((labelOrEvent: unknown) => {
    if (!animation) return;
    if (typeof labelOrEvent !== 'string') return;
    const label = labelOrEvent.trim();
    if (!label) return;
    addMarkerIntent({
      animationId: animation.id,
      timeMs: playbackRef.current.currentTimeMs,
      label,
    });
  }, [animation, addMarkerIntent]);

  const deleteSelectedKeyframes = useCallback(() => {
    if (selectedKeyframes.size === 0 || !activeAnimationId) return;

    deleteKeyframes({
      animationId: activeAnimationId,
      keyframes: parseKeyframeAddressSet(selectedKeyframes),
    });
    setSelectedKeyframes(new Set());
  }, [deleteKeyframes, activeAnimationId, selectedKeyframes, setSelectedKeyframes]);

  const setEasingAt = useCallback((
    targetId: AnimationTargetId,
    propertiesOrTime: string | readonly string[] | number,
    timeOrEasing: number | AnimationEasing,
    optionalEasing?: AnimationEasing,
  ) => {
    if (!activeAnimationId) return;
    let properties: string | readonly string[] | null;
    let timeMs: number;
    let easingType: AnimationEasing;
    if (optionalEasing === undefined) {
      if (typeof timeOrEasing === 'number') return;
      properties = null;
      timeMs = typeof propertiesOrTime === 'number' ? propertiesOrTime : 0;
      easingType = timeOrEasing;
    } else {
      properties = typeof propertiesOrTime === 'number' ? null : propertiesOrTime;
      timeMs = typeof timeOrEasing === 'number' ? timeOrEasing : 0;
      easingType = optionalEasing;
    }
    const addressesAtTime = getAddressesAtTime(animation, targetId, properties, timeMs);
    const useSelection = addressesAtTime.some((address) => selectedKeyframes.has(address));
    const applyTo = useSelection ? selectedKeyframes : new Set(addressesAtTime);
    setKeyframeEasing({
      animationId: activeAnimationId,
      keyframes: parseKeyframeAddressSet(applyTo),
      easing: easingType,
    });
  }, [animation, selectedKeyframes, activeAnimationId, setKeyframeEasing]);

  const removeKeyframeAt = useCallback((
    targetId: AnimationTargetId,
    propertiesOrTime: string | readonly string[] | number,
    optionalTimeMs?: number,
  ) => {
    if (!activeAnimationId) return;
    const properties = optionalTimeMs === undefined || typeof propertiesOrTime === 'number'
      ? null
      : propertiesOrTime;
    const timeMs = optionalTimeMs
      ?? (typeof propertiesOrTime === 'number' ? propertiesOrTime : 0);
    const addressesAtTime = getAddressesAtTime(animation, targetId, properties, timeMs);
    if (addressesAtTime.some((address) => selectedKeyframes.has(address))) {
      deleteSelectedKeyframes();
    } else {
      deleteKeyframes({
        animationId: activeAnimationId,
        keyframes: parseKeyframeAddressSet(new Set(addressesAtTime)),
      });
    }
  }, [animation, selectedKeyframes, deleteSelectedKeyframes, activeAnimationId, deleteKeyframes]);

  return {
    clipboard,
    poseClipboard,
    canCopyPose,
    copyKeyframe,
    pasteKeyframes,
    copyPose,
    pastePose,
    addMarker,
    deleteSelectedKeyframes,
    setEasingAt,
    removeKeyframeAt,
  };
}

export const useKeyframeActions = (...args: Parameters<typeof useKeyframeActionsImpl>): ReturnType<typeof useKeyframeActionsImpl> => useKeyframeActionsImpl(...args);
