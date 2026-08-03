// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { renderHook, act } from '../renderHook.jsx';
import { useKeyframeActions } from '@/features/timeline/application/useKeyframeActions.js';

describe('useKeyframeActions', () => {
  const poseTracks = [
    { targetId: 'node-2', property: 'x', keyframes: [{ time: 500, value: 100, easing: 'ease-in' }] },
    { targetId: 'node-2', property: 'y', keyframes: [{ time: 500, value: 200, easing: 'linear' }] },
    { targetId: 'node-2', property: 'rotation', keyframes: [{ time: 500, value: 45, easing: 'ease-out' }] },
  ];

  function createBaseProps(overrides = {}) {
    return {
      animation: {
        id: 'anim-1',
        tracks: [
          { targetId: 'node-1', property: 'x', keyframes: [{ time: 100, value: 10, easing: 'linear' }] },
          { targetId: 'node-1', property: 'y', keyframes: [{ time: 100, value: 20, easing: 'ease-in' }] },
        ],
      },
      activeAnimationId: 'anim-1',
      currentTimeMs: 500,
      loopKeyframes: false,
      endFrame: 24,
      upsertKeyframes: vi.fn(),
      addMarkerIntent: vi.fn(),
      deleteKeyframes: vi.fn(),
      setKeyframeEasing: vi.fn(),
      selectedKeyframes: new Set(),
      setSelectedKeyframes: vi.fn(),
      sel: ['node-2'],
      targetState: { nodesById: new Map(), bonesById: new Map() },
      currentFrame: 12,
      fps: 24,
      ...overrides,
    };
  }

  it('copyKeyframe aggregates multiple properties at same time into clipboard', () => {
    const props = createBaseProps();
    const { result } = renderHook(() => useKeyframeActions(props));

    act(() => {
      result.current.copyKeyframe('node-1', 100);
    });

    expect(result.current.clipboard).toEqual({
      properties: { x: 10, y: 20 },
      easing: 'ease-in',
    });
  });

  it('pasteKeyframes delegates one named bulk upsert intent', () => {
    const props = createBaseProps();
    const { result } = renderHook(() => useKeyframeActions(props));

    act(() => {
      result.current.copyKeyframe('node-1', 100);
    });
    act(() => {
      result.current.pasteKeyframes();
    });

    expect(props.upsertKeyframes).toHaveBeenCalledOnce();
    expect(props.upsertKeyframes).toHaveBeenCalledWith({
      animationId: 'anim-1',
      keyframes: [
        {
          targetId: 'node-2',
          property: 'x',
          timeMs: 500,
          value: 10,
          easing: 'ease-in',
        },
        {
          targetId: 'node-2',
          property: 'y',
          timeMs: 500,
          value: 20,
          easing: 'ease-in',
        },
      ],
    });
  });

  it('deleteSelectedKeyframes delegates canonical refs without collisions', () => {
    const props = createBaseProps({
      selectedKeyframes: new Set(['node-1:x:100', 'node-1:y:100']),
      setSelectedKeyframes: vi.fn(),
    });
    const { result } = renderHook(() => useKeyframeActions(props));

    act(() => {
      result.current.deleteSelectedKeyframes();
    });

    expect(props.deleteKeyframes).toHaveBeenCalledWith({
      animationId: 'anim-1',
      keyframes: [
        { targetId: 'node-1', property: 'x', timeMs: 100 },
        { targetId: 'node-1', property: 'y', timeMs: 100 },
      ],
    });
    expect(props.setSelectedKeyframes).toHaveBeenCalledWith(new Set());
  });

  it('pastePose with mirror negates X and rotation values (A12)', () => {
    const props = createBaseProps({
      animation: { id: 'anim-1', tracks: poseTracks },
    });
    const { result } = renderHook(() => useKeyframeActions(props));

    act(() => {
      result.current.copyPose();
    });
    expect(result.current.poseClipboard).not.toBeNull();

    act(() => {
      result.current.pastePose(true);
    });

    expect(props.upsertKeyframes).toHaveBeenCalledOnce();
    const call = props.upsertKeyframes.mock.calls[0][0];
    expect(call.keyframes).toBeInstanceOf(Array);

    const xKf = call.keyframes.find(k => k.property === 'x');
    const rotationKf = call.keyframes.find(k => k.property === 'rotation');
    const yKf = call.keyframes.find(k => k.property === 'y');

    expect(xKf).toBeDefined();
    expect(xKf.value).toBe(-100);
    expect(rotationKf).toBeDefined();
    expect(rotationKf.value).toBe(-45);
    expect(yKf).toBeDefined();
    expect(yKf.value).toBe(200);
    expect(xKf.easing).toBe('ease-in');
    expect(rotationKf.easing).toBe('ease-out');

    const allTimes = call.keyframes.map(k => k.timeMs);
    expect(allTimes.every(t => t === 500)).toBe(true);
    expect(allTimes).not.toContain(100);
  });

  it('pastePose without mirror keeps all values positive (no mirror)', () => {
    const props = createBaseProps({
      animation: { id: 'anim-1', tracks: poseTracks },
    });
    const { result } = renderHook(() => useKeyframeActions(props));

    act(() => {
      result.current.copyPose();
    });
    act(() => {
      result.current.pastePose(false);
    });

    const call = props.upsertKeyframes.mock.calls[0][0];
    const xKf = call.keyframes.find(k => k.property === 'x');
    const rotationKf = call.keyframes.find(k => k.property === 'rotation');
    expect(xKf.value).toBe(100);
    expect(rotationKf.value).toBe(45);
  });

  it('copyPose copies only channels keyed exactly at the current frame', () => {
    const props = createBaseProps({
      animation: {
        id: 'anim-1',
        tracks: [
          { targetId: 'node-2', property: 'rotation', keyframes: [{ time: 500, value: 30, easing: 'ease-in' }] },
          { targetId: 'node-2', property: 'x', keyframes: [{ time: 100, value: 10, easing: 'linear' }] },
          { targetId: 'node-2', property: 'scaleX', keyframes: [{ time: 900, value: 2, easing: 'linear' }] },
        ],
      },
    });
    const { result } = renderHook(() => useKeyframeActions(props));

    expect(result.current.canCopyPose).toBe(true);
    act(() => result.current.copyPose());
    act(() => result.current.pastePose(false));

    expect(props.upsertKeyframes).toHaveBeenCalledWith({
      animationId: 'anim-1',
      keyframes: [expect.objectContaining({
        targetId: 'node-2',
        property: 'rotation',
        timeMs: 500,
        value: 30,
        easing: 'ease-in',
        authoring: expect.objectContaining({ role: 'authored', source: 'timeline.copy-pose' }),
      })],
    });
  });

  it('keeps target/value association when copying and pasting multiple poses', () => {
    const props = createBaseProps({
      sel: ['node-b', 'node-a'],
      animation: {
        id: 'anim-1',
        tracks: [
          { targetId: 'node-a', property: 'rotation', keyframes: [{ time: 500, value: 10 }] },
          { targetId: 'node-b', property: 'rotation', keyframes: [{ time: 500, value: 20 }] },
        ],
      },
    });
    const { result } = renderHook(() => useKeyframeActions(props));

    act(() => result.current.copyPose());
    act(() => result.current.pastePose(false));

    expect(props.upsertKeyframes.mock.calls[0][0].keyframes).toHaveLength(2);
    expect(props.upsertKeyframes.mock.calls[0][0].keyframes).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetId: 'node-b', value: 20 }),
      expect.objectContaining({ targetId: 'node-a', value: 10 }),
    ]));
  });

  it('keeps technical child compensation hidden while preserving inherited motion', () => {
    const props = createBaseProps({
      sel: ['bone-2', 'bone-3', 'bone-4', 'bone-5'],
      animation: {
        id: 'anim-1',
        tracks: [
          { targetId: 'bone-2', property: 'rotation', keyframes: [{ time: 500, value: 20 }] },
          {
            targetId: 'bone-3',
            property: 'x',
            keyframes: [{
              time: 500,
              value: 30,
              authoring: { gestureId: 'gesture-1', role: 'support', source: 'bone-hierarchy' },
            }],
          },
          {
            targetId: 'bone-3',
            property: 'rotation',
            keyframes: [{
              time: 500,
              value: 3,
              authoring: { gestureId: 'gesture-1', role: 'derived', source: 'bone-hierarchy' },
            }],
          },
          { targetId: 'bone-4', property: 'rotation', keyframes: [{ time: 500, value: 40 }] },
          {
            targetId: 'bone-5',
            property: 'y',
            keyframes: [{
              time: 500,
              value: 50,
              authoring: { gestureId: 'gesture-2', role: 'support', source: 'bone-hierarchy' },
            }],
          },
        ],
      },
    });
    const { result } = renderHook(() => useKeyframeActions(props));

    act(() => result.current.copyPose());
    act(() => result.current.pastePose(false));

    const keyframes = props.upsertKeyframes.mock.calls[0][0].keyframes;
    const authored = keyframes.filter(keyframe => keyframe.authoring.role === 'authored');
    const derived = keyframes.filter(keyframe => keyframe.authoring.role === 'derived');
    expect(authored).toEqual([
      expect.objectContaining({ targetId: 'bone-2', property: 'rotation', value: 20 }),
      expect.objectContaining({ targetId: 'bone-4', property: 'rotation', value: 40 }),
    ]);
    expect(derived).toEqual([
      expect.objectContaining({ targetId: 'bone-3', property: 'x', value: 30 }),
      expect.objectContaining({ targetId: 'bone-3', property: 'rotation', value: 3 }),
      expect.objectContaining({ targetId: 'bone-5', property: 'y', value: 50 }),
    ]);
    expect(new Set(keyframes.map(keyframe => keyframe.authoring.gestureId)).size).toBe(1);
  });

  it('copies every keyframe at the frame regardless of active target selection', () => {
    const props = createBaseProps({
      sel: ['bone-2'],
      animation: {
        id: 'anim-1',
        tracks: [
          { targetId: 'bone-2', property: 'rotation', keyframes: [{ time: 500, value: 20 }] },
          { targetId: 'bone-4', property: 'rotation', keyframes: [{ time: 500, value: 40 }] },
          { targetId: 'ik-1', property: 'targetX', keyframes: [{ time: 500, value: 80 }] },
        ],
      },
    });
    const { result } = renderHook(() => useKeyframeActions(props));

    act(() => result.current.copyPose());
    act(() => result.current.pastePose(false));

    expect(props.upsertKeyframes.mock.calls[0][0].keyframes).toEqual([
      expect.objectContaining({ targetId: 'bone-2', property: 'rotation', value: 20 }),
      expect.objectContaining({ targetId: 'bone-4', property: 'rotation', value: 40 }),
      expect.objectContaining({ targetId: 'ik-1', property: 'targetX', value: 80 }),
    ]);
  });

  it('disables copyPose on an empty frame and does not create clipboard entries', () => {
    const props = createBaseProps();
    const { result } = renderHook(() => useKeyframeActions(props));

    expect(result.current.canCopyPose).toBe(false);
    let outcome;
    act(() => {
      outcome = result.current.copyPose();
    });

    expect(outcome).toEqual({ changed: false });
    expect(result.current.poseClipboard).toBeNull();
  });

  it('addMarker accepts string label without window.prompt', () => {
    const props = createBaseProps();
    const { result } = renderHook(() => useKeyframeActions(props));

    act(() => {
      result.current.addMarker('Beat');
    });

    expect(props.addMarkerIntent).toHaveBeenCalledWith({
      animationId: 'anim-1',
      timeMs: 500,
      label: 'Beat',
    });
  });

  it('addMarker trims whitespace and rejects empty string', () => {
    const props = createBaseProps();
    const { result } = renderHook(() => useKeyframeActions(props));

    act(() => {
      result.current.addMarker('  ');
    });

    expect(props.addMarkerIntent).not.toHaveBeenCalled();
  });

  it('addMarker rejects non-string input', () => {
    const props = createBaseProps();
    const { result } = renderHook(() => useKeyframeActions(props));

    act(() => {
      result.current.addMarker(undefined);
    });

    expect(props.addMarkerIntent).not.toHaveBeenCalled();
  });

  it('copyPose returns K5 changed false when no entries', () => {
    const props = createBaseProps();
    const { result } = renderHook(() => useKeyframeActions(props));

    let outcome;
    act(() => {
      outcome = result.current.copyPose();
    });

    expect(outcome).toEqual({ changed: false });
  });

  it('pastePose returns K5 changed false when no clipboard', () => {
    const props = createBaseProps();
    const { result } = renderHook(() => useKeyframeActions(props));

    let outcome;
    act(() => {
      outcome = result.current.pastePose(false);
    });

    expect(outcome).toEqual({ changed: false });
  });

  it('pastePose returns K5 success metadata with sourceFrame and targetFrame', () => {
    const props = createBaseProps({
      animation: { id: 'anim-1', tracks: poseTracks },
    });
    const { result } = renderHook(() => {
      const [playback, setPlayback] = useState({ currentTimeMs: 500, currentFrame: 12 });
      return {
        ...useKeyframeActions({ ...props, ...playback }),
        setPlayback,
      };
    });

    let copyResult;
    act(() => {
      copyResult = result.current.copyPose();
    });
    expect(copyResult.changed).toBe(true);
    expect(copyResult.sourceFrame).toBe(12);

    act(() => result.current.setPlayback({ currentTimeMs: 750, currentFrame: 18 }));

    let pasteResult;
    act(() => {
      pasteResult = result.current.pastePose(false);
    });
    expect(pasteResult.changed).toBe(true);
    expect(pasteResult.sourceFrame).toBe(12);
    expect(pasteResult.targetFrame).toBe(18);
  });

  it('setEasingAt applies to all canonical addresses selected at same target/time', () => {
    const props = createBaseProps({
      selectedKeyframes: new Set(['node-1:x:100', 'node-1:y:100']),
    });
    const { result } = renderHook(() => useKeyframeActions(props));

    act(() => {
      result.current.setEasingAt('node-1', 100, 'ease-out');
    });

    expect(props.setKeyframeEasing).toHaveBeenCalledWith({
      animationId: 'anim-1',
      keyframes: [
        { targetId: 'node-1', property: 'x', timeMs: 100 },
        { targetId: 'node-1', property: 'y', timeMs: 100 },
      ],
      easing: 'ease-out',
    });
  });
});
