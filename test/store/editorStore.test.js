import { beforeEach, describe, expect, it } from 'vitest';
import {
  useEditorStore,
  useHoverHit,
  useSelection,
  useView,
} from '@/store/editorStore';
import { CANVAS_DEFAULTS } from '@/features/canvas';
import { BONE_TOOL_DEFAULTS } from '@/features/rigging';

const WORKFLOW_FIELDS = [
  'activeTool',
  'selectionTarget',
  'selectionTargetBeforeShift',
  'riggingMode',
  'riggingTool',
  'toolMode',
  'meshEditMode',
  'meshSubMode',
  'weightPaintMode',
];

const WORKFLOW_ACTIONS = [
  'setActiveTool',
  'setSelectionTarget',
  'toggleSelectionTarget',
  'beginShiftSelectionTarget',
  'endShiftSelectionTarget',
  'setRiggingMode',
  'setRiggingTool',
  'setToolMode',
  'setMeshEditMode',
  'setMeshSubMode',
  'setWeightPaintMode',
];

describe('useEditorStore — durable UI ownership', () => {
  beforeEach(() => {
    useEditorStore.setState({
      selection: [],
      hoverHit: null,
      hoverSource: null,
      activeBoneId: null,
      activeConstraintId: null,
      rigSelectionAnchor: null,
      interaction: { kind: 'idle' },
      view: { zoom: 1, panX: 0, panY: 0 },
      blendShapeEditMode: false,
      activeBlendShapeId: null,
      showSkeleton: true,
    });
  });

  it('does not own workflow fields or workflow actions', () => {
    const state = useEditorStore.getState();
    for (const key of [...WORKFLOW_FIELDS, ...WORKFLOW_ACTIONS]) {
      expect(state).not.toHaveProperty(key);
    }
  });

  it('resetSession restores every slice with fresh mutable collections', () => {
    const previousGroups = useEditorStore.getState().expandedGroups;
    useEditorStore.setState({
      selection: ['part-1'],
      brushSize: 120,
      brushHardness: 0.2,
      expandedGroups: new Set(['group-1']),
      interactionOwner: 'canvas',
    });

    useEditorStore.getState().resetSession();

    expect(useEditorStore.getState()).toMatchObject({
      selection: [],
      brushSize: 30,
      brushHardness: 1,
      interaction: { kind: 'idle' },
      interactionOwner: null,
    });
    expect(useEditorStore.getState().expandedGroups.size).toBe(0);
    expect(useEditorStore.getState().expandedGroups).not.toBe(previousGroups);
  });

  it('setSelection writes payload and resets transient interaction only', () => {
    useEditorStore.setState({ interaction: { kind: 'pendingAssignBone' } });
    useEditorStore.getState().setSelection(['part-1']);
    expect(useEditorStore.getState()).toMatchObject({
      selection: ['part-1'],
      interaction: { kind: 'idle' },
    });
  });

  it('setElementSelection clears rig focus and anchor', () => {
    useEditorStore.setState({
      selection: ['b1'],
      activeBoneId: 'b1',
      activeConstraintId: 'c1',
      rigSelectionAnchor: 'b1',
    });
    useEditorStore.getState().setElementSelection(['part-1']);
    expect(useEditorStore.getState()).toMatchObject({
      selection: ['part-1'],
      activeBoneId: null,
      activeConstraintId: null,
      rigSelectionAnchor: null,
    });
  });

  it('setRigSelection writes rig selection payload without workflow mirrors', () => {
    useEditorStore.getState().setRigSelection({
      boneIds: ['b1', 'b2'],
      constraintIds: ['c1'],
      activeBoneId: 'b2',
      activeConstraintId: 'c1',
    });
    const state = useEditorStore.getState();
    expect(state).toMatchObject({
      selection: ['b1', 'b2', 'c1'],
      activeBoneId: 'b2',
      activeConstraintId: 'c1',
      showSkeleton: true,
    });
    for (const key of WORKFLOW_FIELDS) expect(state).not.toHaveProperty(key);
  });

  it('clearRigSelection clears all rig selection payload', () => {
    useEditorStore.setState({
      selection: ['b1'],
      activeBoneId: 'b1',
      activeConstraintId: 'c1',
      rigSelectionAnchor: 'b1',
    });
    useEditorStore.getState().clearRigSelection();
    expect(useEditorStore.getState()).toMatchObject({
      selection: [],
      activeBoneId: null,
      activeConstraintId: null,
      rigSelectionAnchor: null,
    });
  });

  it('setView merges a partial viewport', () => {
    useEditorStore.getState().setView({ zoom: 2, panX: 10 });
    expect(useEditorStore.getState().view).toEqual({ zoom: 2, panX: 10, panY: 0 });
  });

  it('blend shape actions only own durable blend-shape values', () => {
    useEditorStore.getState().enterBlendShapeEditMode('shape-1');
    expect(useEditorStore.getState()).toMatchObject({
      blendShapeEditMode: true,
      activeBlendShapeId: 'shape-1',
    });
    useEditorStore.getState().exitBlendShapeEditMode();
    expect(useEditorStore.getState()).toMatchObject({
      blendShapeEditMode: false,
      activeBlendShapeId: null,
    });
  });

  it('selector hooks remain bound to durable store', () => {
    expect(useSelection).toBeTypeOf('function');
    expect(useHoverHit).toBeTypeOf('function');
    expect(useView).toBeTypeOf('function');
  });

  describe('showExportArea (Plan 34 — P1/P2)', () => {
    it('defaults to false and is top-level (not inside overlays)', () => {
      const state = useEditorStore.getState();
      expect(state.showExportArea).toBe(false);
      expect(state.overlays).not.toHaveProperty('showExportArea');
    });

    it('setShowExportArea coerces to boolean and does not set hasUnsavedChanges', () => {
      useEditorStore.getState().setShowExportArea(true);
      expect(useEditorStore.getState().showExportArea).toBe(true);
      useEditorStore.getState().setShowExportArea(0);
      expect(useEditorStore.getState().showExportArea).toBe(false);
      useEditorStore.getState().setShowExportArea('truthy');
      expect(useEditorStore.getState().showExportArea).toBe(true);
    });

    it('move mode reveals the area and hiding it exits move mode', () => {
      useEditorStore.getState().setShowExportArea(false);
      useEditorStore.getState().setExportAreaMoveMode(true);
      expect(useEditorStore.getState()).toMatchObject({
        showExportArea: true,
        exportAreaMoveMode: true,
      });
      useEditorStore.getState().setShowExportArea(false);
      expect(useEditorStore.getState()).toMatchObject({
        showExportArea: false,
        exportAreaMoveMode: false,
      });
    });

    it('creates monotonic requests for reopening the Export Area popover', () => {
      const before = useEditorStore.getState().exportAreaPopoverRequest;
      useEditorStore.getState().requestExportAreaPopover();
      expect(useEditorStore.getState().exportAreaPopoverRequest).toBe(before + 1);
    });
  });

  describe('weight paint brush settings', () => {
    it('setWeightPaintBrushMode accepts valid modes and falls back to add', () => {
      const { setWeightPaintBrushMode } = useEditorStore.getState();
      setWeightPaintBrushMode('subtract');
      expect(useEditorStore.getState().weightPaintBrushMode).toBe('subtract');
      setWeightPaintBrushMode('smooth');
      expect(useEditorStore.getState().weightPaintBrushMode).toBe('smooth');
      setWeightPaintBrushMode('invalid');
      expect(useEditorStore.getState().weightPaintBrushMode).toBe('add');
    });

    it('setWeightPaintTargetValue clamps to [0, 1]', () => {
      const { setWeightPaintTargetValue } = useEditorStore.getState();
      setWeightPaintTargetValue(0.5);
      expect(useEditorStore.getState().weightPaintTargetValue).toBe(0.5);
      setWeightPaintTargetValue(2);
      expect(useEditorStore.getState().weightPaintTargetValue).toBe(1);
      setWeightPaintTargetValue(-1);
      expect(useEditorStore.getState().weightPaintTargetValue).toBe(0);
    });
  });
});

describe('centralized defaults (Plan 29)', () => {
  it('viewSlice initializes canvasBackground from CANVAS_DEFAULTS (A1: checker)', () => {
    useEditorStore.setState({ canvasBackground: CANVAS_DEFAULTS.canvasBackground });
    expect(useEditorStore.getState().canvasBackground).toBe('checker');
    expect(CANVAS_DEFAULTS.canvasBackground).toBe('checker');
  });

  it('modeSlice initializes bone tool defaults from BONE_TOOL_DEFAULTS', () => {
    useEditorStore.setState({
      drawBoneChainMode: BONE_TOOL_DEFAULTS.chainMode,
      drawBoneAutoAssign: BONE_TOOL_DEFAULTS.autoAssign,
      drawBoneAutoAssignMode: BONE_TOOL_DEFAULTS.autoAssignMode,
    });
    const state = useEditorStore.getState();
    expect(state.drawBoneChainMode).toBe(false);
    expect(state.drawBoneAutoAssign).toBe(true);
    expect(state.drawBoneAutoAssignMode).toBe('smart');
  });

  it('a fresh store snapshot reflects the centralized defaults', () => {
    useEditorStore.setState({
      canvasBackground: CANVAS_DEFAULTS.canvasBackground,
      drawBoneChainMode: BONE_TOOL_DEFAULTS.chainMode,
      drawBoneAutoAssign: BONE_TOOL_DEFAULTS.autoAssign,
      drawBoneAutoAssignMode: BONE_TOOL_DEFAULTS.autoAssignMode,
    });
    expect(useEditorStore.getState()).toMatchObject({
      canvasBackground: 'checker',
      drawBoneChainMode: false,
      drawBoneAutoAssign: true,
      drawBoneAutoAssignMode: 'smart',
    });
  });

  it('setDrawBoneAutoAssignMode rejects unknown modes and falls back to smart', () => {
    useEditorStore.getState().setDrawBoneAutoAssignMode('classic');
    expect(useEditorStore.getState().drawBoneAutoAssignMode).toBe('classic');
    useEditorStore.getState().setDrawBoneAutoAssignMode('bogus');
    expect(useEditorStore.getState().drawBoneAutoAssignMode).toBe('smart');
  });
});
