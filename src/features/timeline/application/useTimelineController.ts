import { useMemo, useCallback } from 'react';

import type { ProjectDocument } from '@kukla2d/contracts';

import { useAnimationStore } from '@/store/animationStore';
import { useEditorStore } from '@/store/editorStore';
import { useProjectStore } from '@/store/projectStore';

import { canNavigate } from '@/domain/animationAuthoring.js';

import { buildTimelineTrackRows } from './buildTimelineTrackRows.js';
import { createTimelineCommandApi } from './createTimelineCommandApi.js';
import { frameToMs, msToFrame } from '../domain/timelineTime.js';

import type { TimelineTargetDescriptor } from './buildTimelineTrackRows.js';
import type { TimelineCommandApi } from './createTimelineCommandApi.js';

const BONE_PREFIX = '\u{1F9B4} ';

function buildTargetDescriptors(project: ProjectDocument): TimelineTargetDescriptor[] {
  const nodes = project.nodes.map((node) => ({
    id: node.id,
    name: node.name ?? node.id,
    kind: 'node',
  }));
  const bones = project.bones.map((bone) => ({
    id: bone.id,
    name: `${BONE_PREFIX}${bone.name ?? bone.id}`,
    kind: 'bone',
  }));
  const constraints = project.constraints.map((constraint) => ({
    id: constraint.id,
    name: `${constraint.type?.toUpperCase() ?? 'Constraint'} ${constraint.name ?? constraint.id}`,
    kind: 'constraint',
  }));

  return [...nodes, ...bones, ...constraints];
}

function useTimelineControllerImpl() {
  const animations = useProjectStore((s) => s.project.animations);
  const project = useProjectStore((s) => s.project);
  const selection = useEditorStore((s) => s.selection);
  const autoKeyframe = useEditorStore((s) => s.autoKeyframe);
  const setAutoKeyframe = useEditorStore((s) => s.setAutoKeyframe);
  const interactionOwner = useEditorStore((s) => s.interactionOwner);
  const setInteractionOwner = useEditorStore((s) => s.setInteractionOwner);

  const activeAnimationId = useAnimationStore((s) => s.activeAnimationId);
  // Timeline UI is frame-based. Subscribing to raw rAF time forced the full
  // panel to render ~60 times/s even when displayed frame had not changed.
  const currentFrame = useAnimationStore((s) => msToFrame(s.currentTime, s.fps));
  const fps = useAnimationStore((s) => s.fps);
  const startFrame = useAnimationStore((s) => s.startFrame);
  const endFrame = useAnimationStore((s) => s.endFrame);
  const isPlaying = useAnimationStore((s) => s.isPlaying);
  const loop = useAnimationStore((s) => s.loop);
  const speed = useAnimationStore((s) => s.speed);
  const loopKeyframes = useAnimationStore((s) => s.loopKeyframes);
  const loopCount = useAnimationStore((s) => s.loopCount);
  const animPlay = useAnimationStore((s) => s.play);
  const animPause = useAnimationStore((s) => s.pause);
  const animStop = useAnimationStore((s) => s.stop);
  const animSeekFrame = useAnimationStore((s) => s.seekFrame);
  const animSetLoop = useAnimationStore((s) => s.setLoop);
  const animSetSpeed = useAnimationStore((s) => s.setSpeed);
  const animSetLoopKeyframes = useAnimationStore((s) => s.setLoopKeyframes);
  const animSetStartFrame = useAnimationStore((s) => s.setStartFrame);

  const commands = useMemo(() => createTimelineCommandApi(), []);

  const activeClip = useMemo(
    () => animations.find((a) => a.id === activeAnimationId) ?? null,
    [animations, activeAnimationId],
  );

  const currentTime = frameToMs(currentFrame, fps);
  const resolvedEndFrame = Math.max(1, endFrame);
  const resolvedStartFrame = Math.max(0, startFrame);
  const totalFrames = Math.max(resolvedEndFrame - resolvedStartFrame, 1);

  const targetDescriptors = useMemo(() => buildTargetDescriptors(project), [project]);
  const trackRows = useMemo(
    () => buildTimelineTrackRows(activeClip, targetDescriptors),
    [activeClip, targetDescriptors],
  );

  const hasAnimation = animations.length > 0;

  const ensureAnimation = useCallback(() => {
    return commands.ensureAnimationClip();
  }, [commands]);

  const createClip = useCallback<TimelineCommandApi['createAnimationClip']>(
    (payload) => commands.createAnimationClip(payload),
    [commands],
  );

  const renameClip = useCallback<TimelineCommandApi['renameAnimationClip']>(
    (animationId, name) => commands.renameAnimationClip(animationId, name),
    [commands],
  );

  const deleteClip = useCallback<TimelineCommandApi['deleteAnimationClip']>(
    (animationId) => commands.deleteAnimationClip(animationId),
    [commands],
  );

  const selectClip = useCallback<TimelineCommandApi['selectAnimationClip']>(
    (animationId) => commands.selectAnimationClip(animationId),
    [commands],
  );

  const updateTiming = useCallback<TimelineCommandApi['updateAnimationTiming']>(
    (payload) => commands.updateAnimationTiming(payload),
    [commands],
  );

  const upsertKeyframe = useCallback<TimelineCommandApi['upsertAnimationKeyframe']>(
    (payload) => commands.upsertAnimationKeyframe(payload),
    [commands],
  );

  const upsertKeyframes = useCallback<TimelineCommandApi['upsertAnimationKeyframes']>(
    (payload) => commands.upsertAnimationKeyframes(payload),
    [commands],
  );

  const moveKeyframes = useCallback<TimelineCommandApi['moveAnimationKeyframes']>(
    (payload) => commands.moveAnimationKeyframes(payload),
    [commands],
  );

  const editKeyframes = useCallback<TimelineCommandApi['editAnimationKeyframes']>(
    (payload) => commands.editAnimationKeyframes(payload),
    [commands],
  );

  const deleteKeyframes = useCallback<TimelineCommandApi['deleteAnimationKeyframes']>(
    (payload) => commands.deleteAnimationKeyframes(payload),
    [commands],
  );

  const setEasing = useCallback<TimelineCommandApi['setAnimationKeyframeEasing']>(
    (payload) => commands.setAnimationKeyframeEasing(payload),
    [commands],
  );

  const addMarker = useCallback<TimelineCommandApi['addAnimationMarker']>(
    (payload) => commands.addAnimationMarker(payload),
    [commands],
  );

  const addAudioTrack = useCallback<TimelineCommandApi['addAnimationAudioTrack']>(
    (payload) => commands.addAnimationAudioTrack(payload),
    [commands],
  );

  const updateAudioTrack = useCallback<TimelineCommandApi['updateAnimationAudioTrack']>(
    (payload) => commands.updateAnimationAudioTrack(payload),
    [commands],
  );

  const removeAudioTrack = useCallback<TimelineCommandApi['removeAnimationAudioTrack']>(
    (payload) => commands.removeAnimationAudioTrack(payload),
    [commands],
  );

  const setTargetBoomerang = useCallback<TimelineCommandApi['setAnimationTargetBoomerang']>(
    (payload) => commands.setAnimationTargetBoomerang(payload),
    [commands],
  );

  const beginAudioTrackGesture = useCallback<TimelineCommandApi['beginAudioTrackGesture']>(
    (name) => commands.beginAudioTrackGesture(name),
    [commands],
  );

  const endAudioTrackGesture = useCallback(
    () => commands.endAudioTrackGesture(),
    [commands],
  );

  const checkNav = useCallback(() => {
    const animationState = useAnimationStore.getState();
    return canNavigate({ dirty: animationState.draftDirty, values: animationState.draftPose });
  }, []);

  const play = useCallback(() => {
    if (!checkNav().allowed) return;
    animPlay();
  }, [checkNav, animPlay]);
  const pause = useCallback(() => animPause(), [animPause]);
  const stop = useCallback(() => {
    if (!checkNav().allowed) return;
    animStop();
  }, [checkNav, animStop]);
  const seekFrame = useCallback((frame: number): boolean => {
    if (!checkNav().allowed) return false;
    animSeekFrame(frame);
    return true;
  }, [checkNav, animSeekFrame]);
  const setLoop = useCallback((value: boolean) => animSetLoop(value), [animSetLoop]);
  const setSpeed = useCallback((value: number) => animSetSpeed(value), [animSetSpeed]);
  const setLoopKeyframes = useCallback((value: boolean) => animSetLoopKeyframes(value), [animSetLoopKeyframes]);
  const setStartFrame = useCallback((value: number) => animSetStartFrame(value), [animSetStartFrame]);

  return {
    activeClip,
    animations,
    selection,
    autoKeyframe,
    setAutoKeyframe,
    interactionOwner,
    setInteractionOwner,
    fps,
    currentFrame,
    startFrame: resolvedStartFrame,
    endFrame: resolvedEndFrame,
    totalFrames,
    trackRows,
    hasAnimation,
    targetDescriptors,
    commands,
    ensureAnimation,
    createClip,
    renameClip,
    deleteClip,
    selectClip,
    updateTiming,
    upsertKeyframe,
    upsertKeyframes,
    moveKeyframes,
    editKeyframes,
    deleteKeyframes,
    setEasing,
    addMarker,
    addAudioTrack,
    updateAudioTrack,
    removeAudioTrack,
    beginAudioTrackGesture,
    endAudioTrackGesture,
    setTargetBoomerang,
    isPlaying,
    loop,
    speed,
    loopKeyframes,
    loopCount,
    currentTime,
    play,
    pause,
    stop,
    seekFrame,
    setLoop,
    setSpeed,
    setLoopKeyframes,
    setStartFrame,
  };
}

export const useTimelineController = (): ReturnType<typeof useTimelineControllerImpl> => useTimelineControllerImpl();
