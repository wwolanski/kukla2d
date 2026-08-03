import { describe, expect, it, vi } from 'vitest';
import {
  handleDragMove as onDragMove,
  startMoveDrag,
  startResizeDrag,
  startRotateDrag,
} from '@/features/canvas/infrastructure/rendering/pixi/PixiInputDrag.js';
import {
  startBoneDrag,
  startBoneLength,
  startBoneRotate,
} from '@/features/canvas/infrastructure/rendering/pixi/PixiBoneTransformDrag.js';

function createAdapter({
  editor,
  project,
  effectiveNodes = project.nodes,
  effectiveBones = project.bones,
}) {
  const draft = new Map();
  const preview = new Map();
  const animation = {
    activeAnimationId: editor.editorMode === 'animation' ? 'anim-1' : null,
    currentTime: 0,
    draftPose: draft,
    setDraftPose(targetId, partial) {
      draft.set(targetId, { ...(draft.get(targetId) ?? {}), ...partial });
    },
    clearDraftPoseForNode(targetId) {
      draft.delete(targetId);
    },
  };
  const adapter = {
    editorRef: { current: editor },
    projectRef: { current: project },
    animationRef: { current: animation },
    animationAuthoringAdapter: {
      previewPartial: vi.fn((targetId, partial) => {
        animation.setDraftPose(targetId, partial);
        return { valid: true };
      }),
      beginGesture: vi.fn(() => 'test-gesture'),
    },
    readFramePose: () => ({
      effectiveNodes,
      effectiveBones,
      poseOverrides: draft,
    }),
    _eventWorldPosition: event => event.world,
    _setPreviewPose(targetId, partial) {
      preview.set(targetId, { ...(preview.get(targetId) ?? {}), ...partial });
    },
    _setDragState(state) { this._dragState = state; },
    _sendWorkflow: vi.fn(),
    _beginCommandBatch: vi.fn(),
    _executeCommand: vi.fn(command => {
      if (command.type === 'updateProject') command.payload.mutator(project);
    }),
    markDirty: vi.fn(),
  };
  return { adapter, animation, draft, preview };
}

describe('Pixi transform draft regressions', () => {
  it('moves from rendered animation pose instead of stale project transform', () => {
    const project = {
      nodes: [{ id: 'part', type: 'part', transform: { x: 10, y: 20 } }],
      bones: [],
      animations: [{ id: 'anim-1', tracks: [] }],
    };
    const editor = {
      editorMode: 'animation',
      activeTool: 'transform',
      selection: ['part'],
      view: { zoom: 1, panX: 0, panY: 0 },
    };
    const effectiveNodes = [{ ...project.nodes[0], transform: { x: 100, y: 200 } }];
    const { adapter, draft } = createAdapter({ editor, project, effectiveNodes });

    startMoveDrag(adapter, { world: { x: 300, y: 400 } });
    onDragMove(adapter, { world: { x: 315, y: 390 } });

    expect(draft.get('part')).toEqual({ x: 115, y: 190 });
    expect(project.nodes[0].transform).toEqual({ x: 10, y: 20 });
  });

  it('resizes in the rendered post-IK coordinate system', () => {
    const project = {
      nodes: [{
        id: 'part', type: 'part',
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      }],
      bones: [],
      animations: [],
    };
    const editor = {
      editorMode: 'staging',
      activeTool: 'transform',
      selection: ['part'],
      view: { zoom: 1, panX: 0, panY: 0 },
    };
    // The displayed node has been moved and rotated 90 degrees by the final
    // frame pose. Local corner (10,20) is therefore world point (80,60).
    const effectiveNodes = [{
      ...project.nodes[0],
      transform: { ...project.nodes[0].transform, x: 100, y: 50, rotation: 90 },
    }];
    const { adapter, preview } = createAdapter({ editor, project, effectiveNodes });

    startResizeDrag(adapter, { world: { x: 80, y: 60 } }, 2, {
      bboxPoints: [{ x: 100, y: 50 }, { x: 100, y: 60 }, { x: 80, y: 60 }, { x: 80, y: 50 }],
    });
    // World (60,70) maps to local (20,40): exactly 2x on both axes.
    onDragMove(adapter, { world: { x: 60, y: 70 } });

    expect(preview.get('part').scaleX).toBeCloseTo(2);
    expect(preview.get('part').scaleY).toBeCloseTo(2);
  });

  it('resizes from every corner while keeping the opposite corner fixed', () => {
    const frame = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ];
    const expectedPosition = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    for (let cornerIndex = 0; cornerIndex < frame.length; cornerIndex++) {
      const project = {
        nodes: [{
          id: 'part', type: 'part', imageBounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
          transform: { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
        }],
        bones: [],
        animations: [],
      };
      const editor = {
        editorMode: 'staging',
        activeTool: 'transform',
        selection: ['part'],
        view: { zoom: 1, panX: 0, panY: 0 },
      };
      const { adapter, preview } = createAdapter({ editor, project });
      const fixed = frame[(cornerIndex + 2) % frame.length];
      const start = frame[cornerIndex];
      const dragged = {
        x: fixed.x + (start.x - fixed.x) * 2,
        y: fixed.y + (start.y - fixed.y) * 2,
      };

      startResizeDrag(adapter, { world: start }, cornerIndex, { bboxPoints: frame });
      onDragMove(adapter, { world: dragged });

      expect(preview.get('part').scaleX).toBeCloseTo(2);
      expect(preview.get('part').scaleY).toBeCloseTo(2);
      expect(preview.get('part').x).toBeCloseTo(expectedPosition[cornerIndex].x);
      expect(preview.get('part').y).toBeCloseTo(expectedPosition[cornerIndex].y);
    }
  });

  it('rotates around the rendered post-IK pivot', () => {
    const project = {
      nodes: [{
        id: 'part', type: 'part',
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      }],
      bones: [],
      animations: [],
    };
    const editor = {
      editorMode: 'staging',
      activeTool: 'transform',
      selection: ['part'],
      view: { zoom: 1, panX: 0, panY: 0 },
    };
    const effectiveNodes = [{
      ...project.nodes[0],
      transform: { ...project.nodes[0].transform, x: 100, y: 50, rotation: 90 },
    }];
    const { adapter, preview } = createAdapter({ editor, project, effectiveNodes });

    startRotateDrag(adapter, { world: { x: 110, y: 50 } });
    onDragMove(adapter, { world: { x: 100, y: 60 } });

    expect(preview.get('part').rotation).toBeCloseTo(180);
  });

  it('reapplies linked resize from its snapshot after crossing zero scale', () => {
    const transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 };
    const project = {
      nodes: [
        { id: 'part', type: 'part', boneId: 'bone', transform: { ...transform } },
        { id: 'sibling', type: 'part', boneId: 'bone', transform: { ...transform, x: 200 } },
        { id: 'unrelated', type: 'part', boneId: 'other', transform: { ...transform, x: 400 } },
      ],
      bones: [
        { id: 'bone', setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 100 } },
        { id: 'other', setup: { x: 400, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 100 } },
      ],
      animations: [],
    };
    const editor = {
      editorMode: 'staging',
      activeTool: 'transform',
      selection: ['part'],
      view: { zoom: 1, panX: 0, panY: 0 },
    };
    const { adapter } = createAdapter({ editor, project });

    startResizeDrag(adapter, { world: { x: 100, y: 100 } }, 2, {
      bboxPoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    });
    onDragMove(adapter, { world: { x: 0.000001, y: 0.000001 } });
    onDragMove(adapter, { world: { x: 50, y: 50 } });

    expect(project.nodes[0].transform.scaleX).toBeCloseTo(0.5);
    expect(project.nodes[1].transform.scaleX).toBeCloseTo(0.5);
    expect(project.nodes[2].transform.scaleX).toBe(1);
    expect(project.bones[0].setup.length).toBeCloseTo(50);
    expect(project.bones[1].setup.length).toBe(100);
  });

  it('blocks bone translation in staging POSE', () => {
    const project = {
      nodes: [],
      bones: [{ id: 'bone', setup: { x: 0, y: 0, rotation: 0, length: 80 } }],
      animations: [],
    };
    const editor = {
      editorMode: 'staging',
      activeTool: 'pose',
      selection: ['bone'],
      activeBoneId: 'bone',
      view: { zoom: 1, panX: 0, panY: 0 },
    };
    const effectiveBones = [{ ...project.bones[0], setup: { x: 50, y: 60, rotation: 0, length: 80 } }];
    const { adapter, draft } = createAdapter({ editor, project, effectiveBones });

    startBoneDrag(adapter, { world: { x: 50, y: 60 } }, 'bone');

    expect(adapter._dragState).toBeUndefined();
    expect(draft.size).toBe(0);
    expect(project.bones[0].setup).toEqual({ x: 0, y: 0, rotation: 0, length: 80 });
  });

  it('keeps raw setup as the bind snapshot when IK changes the displayed bone', () => {
    const project = {
      nodes: [],
      bones: [{ id: 'bone', setup: { x: 10, y: 20, rotation: 5, length: 80 } }],
      constraints: [{
        id: 'ik',
        type: 'ik',
        affectedBoneIds: ['bone'],
        targetX: 200,
        targetY: 100,
      }],
      animations: [],
    };
    const editor = {
      editorMode: 'staging',
      activeTool: 'transform',
      selection: ['bone'],
      activeBoneId: 'bone',
      view: { zoom: 1, panX: 0, panY: 0 },
    };
    const effectiveBones = [{
      ...project.bones[0],
      setup: { x: 10, y: 20, rotation: 47, length: 80 },
    }];
    const { adapter } = createAdapter({ editor, project, effectiveBones });

    startBoneDrag(adapter, { world: { x: 10, y: 20 } }, 'bone');

    expect(adapter._dragState.startBones.bone.rotation).toBe(47);
    expect(adapter._dragState.setupEffectiveValues.bone.rotation).toBe(5);
  });

  it('does not replace a saved pose when Transform only selects a bone', () => {
    const project = {
      nodes: [],
      bones: [{ id: 'bone', setup: { x: 0, y: 0, rotation: 0, length: 80 } }],
      defaultPose: { bone: { x: 50, rotation: 30 } },
      animations: [],
    };
    const editor = {
      editorMode: 'staging',
      activeTool: 'transform',
      selection: ['bone'],
      activeBoneId: 'bone',
      view: { zoom: 1, panX: 0, panY: 0 },
    };
    const effectiveBones = [{
      ...project.bones[0],
      setup: { x: 50, y: 0, rotation: 30, length: 80 },
    }];
    const { adapter } = createAdapter({ editor, project, effectiveBones });

    startBoneDrag(adapter, { world: { x: 50, y: 0 } }, 'bone');

    expect(adapter._dragState).toBeUndefined();
    expect(project.defaultPose).toEqual({ bone: { x: 50, rotation: 30 } });
    expect(project.bones[0].setup).toEqual({ x: 0, y: 0, rotation: 0, length: 80 });
  });

  it('rotates a bone in ANIMATION through authoring draft, not project setup', () => {
    const project = {
      nodes: [],
      bones: [{ id: 'bone', setup: { x: 0, y: 0, rotation: 5, length: 80 } }],
      animations: [{ id: 'anim-1', tracks: [] }],
    };
    const editor = {
      editorMode: 'animation',
      activeTool: 'transform',
      selection: ['bone'],
      activeBoneId: 'bone',
      view: { zoom: 1, panX: 0, panY: 0 },
    };
    const effectiveBones = [{ ...project.bones[0], setup: { x: 10, y: 20, rotation: 30, length: 80 } }];
    const { adapter, draft } = createAdapter({ editor, project, effectiveBones });

    startBoneRotate(adapter, { world: { x: 20, y: 20 } });
    onDragMove(adapter, { world: { x: 10, y: 30 } });

    expect(draft.get('bone').rotation).toBeCloseTo(120);
    expect(project.bones[0].setup.rotation).toBe(5);
  });

  it('blocks bone length drag in Animation mode (R5)', () => {
    const project = {
      nodes: [],
      bones: [{ id: 'bone', setup: { x: 0, y: 0, rotation: 0, length: 50 } }],
      animations: [{ id: 'anim-1', tracks: [] }],
    };
    const editor = {
      editorMode: 'animation',
      activeTool: 'transform',
      selection: ['bone'],
      activeBoneId: 'bone',
      view: { zoom: 1, panX: 0, panY: 0 },
    };
    const effectiveBones = [{ ...project.bones[0], setup: { x: 0, y: 0, rotation: 90, length: 100 } }];
    const { adapter, draft } = createAdapter({ editor, project, effectiveBones });

    startBoneLength(adapter, { world: { x: 0, y: 100 } });

    expect(adapter._dragState).toBeFalsy();
    expect(draft.size).toBe(0);
    expect(project.bones[0].setup.length).toBe(50);
  });
});
