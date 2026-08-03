import { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from 'react';

import { getDefaultValue } from '@/domain/animationTargets';

import { createAnimationAuthoringApi } from '@/features/animation';

import { AudioTrackList } from './AudioTrackList.jsx';
import { EditableGraphEditor } from './EditableGraphEditor.jsx';
import { KeyguideLabels } from './KeyframeGuide.jsx';
import { MarkerDialog } from './MarkerDialog.jsx';
import { PendingDraftBanner } from './PendingDraftBanner.jsx';
import { Playhead } from './Playhead.jsx';
import { Ruler } from './Ruler.jsx';
import { SelectionBox } from './SelectionBox.jsx';
import { LAYOUT } from './timelineLayout.js';
import { TrackList } from './TrackList.jsx';
import { TransportBar } from './TransportBar.jsx';
import { flattenVisibleRows } from '../application/buildTimelineTrackRows.js';
import { parseKeyframeAddress, keyframeAddressToString } from '../application/keyframeAddress.js';
import { buildKeyguideFrames } from '../application/keyframeGuide.js';
import { computeRulerTicks } from '../application/rulerTicks.js';
import { useAnimationBootstrap } from '../application/useAnimationBootstrap.js';
import { useAudioSync } from '../application/useAudioSync.js';
import { useKeyframeActions } from '../application/useKeyframeActions.js';
import { useKeyframeSelection } from '../application/useKeyframeSelection.js';
import { useTimelineController } from '../application/useTimelineController.js';
import { useTimelineGeometry } from '../application/useTimelineGeometry.js';



export function TimelinePanel() {
  const ctrl = useTimelineController();

  const trackAreaRef = useRef(null);
  const rulerRef = useRef(null);
  const panelRef = useRef(null);

  const [rulerWidth, setRulerWidth] = useState(400);
  const [rulerElement, setRulerElement] = useState(null);
  const [guideAreaElement, setGuideAreaElement] = useState(null);
  const [guideTrackGeometry, setGuideTrackGeometry] = useState(null);

  const setRulerElementRef = useCallback((element) => {
    rulerRef.current = element;
    setRulerElement(element);
  }, []);

  const setGuideAreaElementRef = useCallback((element) => {
    setGuideAreaElement(element);
  }, []);

  useEffect(() => {
    if (!rulerElement) return undefined;
    const updateWidth = (width) => {
      const contentWidth = width - 2 * LAYOUT.TRACK_PAD;
      setRulerWidth(Math.max(contentWidth, 100));
    };
    updateWidth(rulerElement.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        updateWidth(entry.contentRect.width);
      }
    });
    ro.observe(rulerElement);
    return () => ro.disconnect();
  }, [rulerElement]);

  useLayoutEffect(() => {
    if (!rulerElement || !guideAreaElement) return undefined;

    const updateGuideGeometry = () => {
      const rulerRect = rulerElement.getBoundingClientRect();
      const guideRect = guideAreaElement.getBoundingClientRect();
      const next = {
        left: rulerRect.left - guideRect.left + LAYOUT.TRACK_PAD,
        width: Math.max(rulerRect.width - 2 * LAYOUT.TRACK_PAD, 0),
      };
      setGuideTrackGeometry(previous => (
        previous?.left === next.left && previous?.width === next.width ? previous : next
      ));
    };

    updateGuideGeometry();
    if (typeof ResizeObserver === 'undefined') return undefined;

    const ro = new ResizeObserver(updateGuideGeometry);
    ro.observe(rulerElement);
    ro.observe(guideAreaElement);
    return () => ro.disconnect();
  }, [rulerElement, guideAreaElement]);

  const rulerTicks = useMemo(
    () => computeRulerTicks({ startFrame: ctrl.startFrame, endFrame: ctrl.endFrame, widthPx: rulerWidth }),
    [ctrl.startFrame, ctrl.endFrame, rulerWidth],
  );

  const [timelineMode, setTimelineMode] = useState('dope');
  const [expandedTargets, setExpandedTargets] = useState(() => new Set());
  const [markerDialogOpen, setMarkerDialogOpen] = useState(false);
  const authoringApi = useMemo(() => createAnimationAuthoringApi(), []);
  const currentTimeRef = useRef(ctrl.currentTime);
  currentTimeRef.current = ctrl.currentTime;

  const { ensureAnimation } = useAnimationBootstrap({
    activeClip: ctrl.activeClip,
    animations: ctrl.animations,
    selectClip: ctrl.selectClip,
    createClip: ctrl.createClip,
  });

  useAudioSync(ctrl.activeClip, {
    currentTimeMs: ctrl.currentTime,
    playing: ctrl.isPlaying,
    activeAnimationId: ctrl.activeClip?.id ?? null,
    loopSignal: ctrl.loopCount,
  });

  const { xToFrame, frameToPercentage } = useTimelineGeometry({
    rulerRef,
    startFrame: ctrl.startFrame,
    endFrame: ctrl.endFrame,
  });

  const flattenedRows = useMemo(
    () => flattenVisibleRows(ctrl.trackRows, expandedTargets),
    [ctrl.trackRows, expandedTargets],
  );

  const guideFrames = useMemo(
    () => buildKeyguideFrames({
      startFrame: ctrl.startFrame,
      endFrame: ctrl.endFrame,
      fps: ctrl.fps,
      hasVisibleKeyframes: ctrl.trackRows.length > 0,
    }),
    [ctrl.startFrame, ctrl.endFrame, ctrl.fps, ctrl.trackRows.length],
  );

  const {
    selectedKeyframes,
    selectionBox,
    keyframePreview,
    setSelectedKeyframes,
    onRulerPointerDown,
    onKeyframePointerDown,
    onTrackAreaPointerDown,
  } = useKeyframeSelection({
    rulerRef,
    trackAreaRef,
    animation: ctrl.activeClip,
    xToFrame,
    startFrame: ctrl.startFrame,
    endFrame: ctrl.endFrame,
    totalFrames: ctrl.totalFrames,
    fps: ctrl.fps,
    activeAnimationId: ctrl.activeClip?.id ?? null,
    seekFrame: ctrl.seekFrame,
    moveKeyframes: ctrl.moveKeyframes,
    flattenedRows,
  });

  const {
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
  } = useKeyframeActions({
    animation: ctrl.activeClip,
    activeAnimationId: ctrl.activeClip?.id ?? null,
    currentTimeMs: ctrl.currentTime,
    upsertKeyframes: ctrl.upsertKeyframes,
    addMarkerIntent: ctrl.addMarker,
    deleteKeyframes: ctrl.deleteKeyframes,
    setKeyframeEasing: ctrl.setEasing,
    selectedKeyframes,
    setSelectedKeyframes,
    sel: ctrl.selection,
    currentFrame: ctrl.currentFrame,
  });

  const handleMarkerConfirm = useCallback((label) => {
    addMarker(label);
  }, [addMarker]);

  const onToggleTarget = useCallback((targetId) => {
    setExpandedTargets(prev => {
      const next = new Set(prev);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  }, []);

  const editKeyframes = ctrl.editKeyframes;
  const setTargetBoomerang = ctrl.setTargetBoomerang;
  const activeClip = ctrl.activeClip;
  const trackRows = ctrl.trackRows;

  const onGraphCommit = useCallback(({ animationId, edits }) => {
    editKeyframes({ animationId, edits });
  }, [editKeyframes]);

  const onToggleBoomerang = useCallback((targetId) => {
    if (!activeClip) return;
    const row = trackRows.find(r => r.targetId === targetId);
    const currentlyEnabled = row?.boomerangCutoff?.enabled ?? false;
    setTargetBoomerang({ animationId: activeClip.id, targetId, enabled: !currentlyEnabled });
  }, [activeClip, trackRows, setTargetBoomerang]);

  const onAddProperty = useCallback((targetId, property) => {
    if (!ctrl.activeClip) return;
    const defaultValue = getDefaultValue(property, null);
    authoringApi.preview({
      animationId: ctrl.activeClip.id,
      targetId,
      property,
      value: defaultValue,
      timeMs: currentTimeRef.current,
      source: 'timeline',
      phase: 'commit',
    });
    authoringApi.commit({ source: 'timeline-add-property' });
  }, [ctrl.activeClip, authoringApi]);

  useEffect(() => {
    if (ctrl.trackRows.length > 0 && expandedTargets.size === 0) {
      setExpandedTargets(new Set(ctrl.trackRows.map(r => r.targetId)));
    }
  }, [ctrl.trackRows, expandedTargets.size]);

  const visibleRowCount = flattenedRows.length;
  const audioTrackCount = ctrl.activeClip?.audioTracks?.length ?? 0;

  const { setInteractionOwner: setTimelineOwner } = ctrl;

  const handlePanelPointerDown = useCallback((e) => {
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.isContentEditable) return;
    setTimelineOwner('timeline');
  }, [setTimelineOwner]);

  const handlePanelFocus = useCallback(() => {
    setTimelineOwner('timeline');
  }, [setTimelineOwner]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      if (ctrl.interactionOwner !== 'timeline') return;

      const isMod = e.ctrlKey || e.metaKey;

      if (isMod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (!ctrl.activeClip) return;
        const allAddresses = new Set();
        for (const track of ctrl.activeClip.tracks) {
          for (const kf of track.keyframes) {
            allAddresses.add(keyframeAddressToString({
              targetId: track.targetId,
              property: track.property,
              timeMs: kf.time,
            }));
          }
        }
        setSelectedKeyframes(allAddresses);
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deleteSelectedKeyframes();
      } else if (isMod) {
        if (e.key === 'c') {
          if (selectedKeyframes.size > 0) {
            const first = selectedKeyframes.values().next().value;
            const address = parseKeyframeAddress(first);
            if (address) copyKeyframe(address.targetId, address.timeMs);
          }
        } else if (e.key === 'v') {
          pasteKeyframes();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelectedKeyframes, selectedKeyframes, copyKeyframe, pasteKeyframes, ctrl.interactionOwner, ctrl.activeClip, setSelectedKeyframes]);

  return (
    <div
      ref={panelRef}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden select-none text-xs"
      data-interaction-owner="timeline"
      onPointerDown={handlePanelPointerDown}
      onFocusCapture={handlePanelFocus}
    >
      <TransportBar
        animation={ctrl.activeClip}
        ensureAnimation={ensureAnimation}
        setAutoKeyframe={ctrl.setAutoKeyframe}
        autoKeyframe={ctrl.autoKeyframe}
        updateTiming={ctrl.updateTiming}
        timelineMode={timelineMode}
        setTimelineMode={setTimelineMode}
        onRequestMarker={() => setMarkerDialogOpen(true)}
        addAudioTrack={ctrl.addAudioTrack}
        copyPose={copyPose}
        canCopyPose={canCopyPose}
        pastePose={pastePose}
        poseClipboard={poseClipboard}
        currentFrame={ctrl.currentFrame}
        startFrame={ctrl.startFrame}
        endFrame={ctrl.endFrame}
        fps={ctrl.fps}
        isPlaying={ctrl.isPlaying}
        loop={ctrl.loop}
        speed={ctrl.speed}
        loopKeyframes={ctrl.loopKeyframes}
        play={ctrl.play}
        pause={ctrl.pause}
        stop={ctrl.stop}
        seekFrame={ctrl.seekFrame}
        setLoop={ctrl.setLoop}
        setSpeed={ctrl.setSpeed}
        setLoopKeyframes={ctrl.setLoopKeyframes}
        setStartFrame={ctrl.setStartFrame}
      />

      <PendingDraftBanner />

      {timelineMode === 'graph' && (
        <EditableGraphEditor
          rows={ctrl.trackRows}
          selectedKeyframes={selectedKeyframes}
          fps={ctrl.fps}
          startFrame={ctrl.startFrame}
          endFrame={ctrl.endFrame}
          totalFrames={ctrl.totalFrames}
          animation={ctrl.activeClip}
          activeAnimationId={ctrl.activeClip?.id ?? null}
          onCommitEdits={onGraphCommit}
        />
      )}

      <div
        className="relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto select-none"
        ref={trackAreaRef}
        onPointerDown={onTrackAreaPointerDown}
      >
        {ctrl.trackRows.length === 0 && audioTrackCount === 0 ? (
          ctrl.hasAnimation && guideFrames.length > 0 ? (
            <div ref={setGuideAreaElementRef} className="relative h-full min-h-0 w-full min-w-0">
              <Ruler
                startFrame={ctrl.startFrame}
                endFrame={ctrl.endFrame}
                fps={ctrl.fps}
                animation={ctrl.activeClip}
                frameToPercentage={frameToPercentage}
                onPointerDown={onRulerPointerDown}
                rulerRef={setRulerElementRef}
                rulerTicks={rulerTicks}
              />
              <div className="absolute bottom-0" style={{ top: LAYOUT.RULER_H, ...guideTrackGeometry }}>
                {guideTrackGeometry && (
                  <KeyguideLabels
                    frames={guideFrames}
                    seekFrame={ctrl.seekFrame}
                    frameToPercentage={frameToPercentage}
                  />
                )}
              </div>
              <Playhead
                frac={(ctrl.currentFrame - ctrl.startFrame) / ctrl.totalFrames}
                labelWidth={LAYOUT.LABEL_W}
                trackPad={LAYOUT.TRACK_PAD}
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-[11px] text-muted-foreground/60">
                Create an animation to begin
              </p>
            </div>
          )
        ) : (
          <div className="relative w-full min-w-0 isolate" style={{ minHeight: LAYOUT.RULER_H + (visibleRowCount + audioTrackCount) * LAYOUT.ROW_H }}>

            {selectionBox && (
              <SelectionBox
                x={selectionBox.x}
                y={selectionBox.y}
                w={selectionBox.w}
                h={selectionBox.h}
                labelWidth={LAYOUT.LABEL_W}
              />
            )}

            <Ruler
              startFrame={ctrl.startFrame}
              endFrame={ctrl.endFrame}
              fps={ctrl.fps}
              animation={ctrl.activeClip}
              frameToPercentage={frameToPercentage}
              onPointerDown={onRulerPointerDown}
              rulerRef={setRulerElementRef}
              rulerTicks={rulerTicks}
            />

            <div className="absolute inset-0 pointer-events-none" style={{ top: LAYOUT.RULER_H, left: LAYOUT.LABEL_W }}>
              <div className="absolute inset-y-0" style={{ left: LAYOUT.TRACK_PAD, right: LAYOUT.TRACK_PAD }}>
                {rulerTicks.map(t => (
                  <div
                    key={t.frame}
                    className="absolute top-0 bottom-0 w-px bg-border/10"
                    style={{ left: frameToPercentage(t.frame) }}
                  />
                ))}
              </div>
            </div>

            <TrackList
              trackRows={ctrl.trackRows}
              expandedTargets={expandedTargets}
              onToggleTarget={onToggleTarget}
              onToggleBoomerang={onToggleBoomerang}
              fps={ctrl.fps}
              startFrame={ctrl.startFrame}
              endFrame={ctrl.endFrame}
              totalFrames={ctrl.totalFrames}
              selectedKeyframes={selectedKeyframes}
              frameToPercentage={frameToPercentage}
              onKeyframePointerDown={onKeyframePointerDown}
              clipboard={clipboard}
              copyKeyframe={copyKeyframe}
              pasteKeyframes={pasteKeyframes}
              setEasingAt={setEasingAt}
              removeKeyframeAt={removeKeyframeAt}
              sel={ctrl.selection}
              loopKeyframes={ctrl.loopKeyframes}
              onAddProperty={onAddProperty}
              keyframePreview={keyframePreview}
            />

            <AudioTrackList
              tracks={ctrl.activeClip?.audioTracks ?? []}
              animationId={ctrl.activeClip?.id ?? null}
              timelineDurationMs={ctrl.activeClip?.duration ?? 2000}
              updateAudioTrack={ctrl.updateAudioTrack}
              removeAudioTrack={ctrl.removeAudioTrack}
              beginAudioTrackGesture={ctrl.beginAudioTrackGesture}
              endAudioTrackGesture={ctrl.endAudioTrackGesture}
              xToFrame={xToFrame}
              startFrame={ctrl.startFrame}
              totalFrames={ctrl.totalFrames}
              fps={ctrl.fps}
            />

            {(ctrl.trackRows.length > 0 || audioTrackCount > 0) && (
              <Playhead
                frac={(ctrl.currentFrame - ctrl.startFrame) / ctrl.totalFrames}
                labelWidth={LAYOUT.LABEL_W}
                trackPad={LAYOUT.TRACK_PAD}
              />
            )}
          </div>
        )}
      </div>

      <MarkerDialog
        open={markerDialogOpen}
        onOpenChange={setMarkerDialogOpen}
        currentFrame={ctrl.currentFrame}
        onConfirm={handleMarkerConfirm}
      />
    </div>
  );
}
