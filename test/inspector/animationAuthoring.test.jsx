import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSource(relativePath) {
  return readFileSync(resolve(import.meta.dirname, '../../', relativePath), 'utf-8');
}

const TRANSFORM_PANEL = readSource('src/features/inspector/components/node/TransformPanel.jsx');
const NODE_DETAILS = readSource('src/features/inspector/components/node/NodeDetails.jsx');
const SHAPE_KEYS_PANEL = readSource('src/features/inspector/components/node/ShapeKeysPanel.jsx');
const BONE_INSPECTOR = readSource('src/features/inspector/components/rig/BoneInspector.jsx');
const IK_INSPECTOR = readSource('src/features/inspector/components/rig/IkConstraintInspector.jsx');
const NODE_INSPECTOR_CONTROLLER = readSource('src/features/inspector/application/useNodeInspectorController.ts');
const BONE_INSPECTOR_CONTROLLER = readSource('src/features/inspector/application/useBoneInspectorController.ts');
const IK_INSPECTOR_CONTROLLER = readSource('src/features/inspector/application/useIkConstraintInspectorController.ts');

describe('inspector animation authoring boundary', () => {
  describe('TransformPanel', () => {
    it('does not dispatch synthetic KeyboardEvent', () => {
      expect(TRANSFORM_PANEL).not.toMatch(/KeyboardEvent/);
      expect(TRANSFORM_PANEL).not.toMatch(/dispatchEvent.*new/);
    });

    it('does not call setDraftPose directly', () => {
      expect(TRANSFORM_PANEL).not.toMatch(/setDraftPose/);
    });

    it('does not import raw animation mutation', () => {
      expect(TRANSFORM_PANEL).not.toMatch(/import.*upsertKeyframe.*from/);
      expect(TRANSFORM_PANEL).not.toMatch(/import.*computePoseOverrides.*from/);
    });

    it('uses authoring API for animation mode', () => {
      expect(TRANSFORM_PANEL).toMatch(/useTransformInspectorController/);
      expect(NODE_INSPECTOR_CONTROLLER).toMatch(/inspectorPreview/);
      expect(NODE_INSPECTOR_CONTROLLER).toMatch(/inspectorCommit/);
    });

    it('imports from @/features/animation', () => {
      expect(NODE_INSPECTOR_CONTROLLER).toMatch(
        /from ['"]@\/features\/animation(?:\/index)?(?:\.js)?['"]/
      );
    });
  });

  describe('NodeDetails', () => {
    it('does not dispatch synthetic KeyboardEvent', () => {
      expect(NODE_DETAILS).not.toMatch(/KeyboardEvent/);
      expect(NODE_DETAILS).not.toMatch(/dispatchEvent.*new/);
    });

    it('does not call setDraftPose directly', () => {
      expect(NODE_DETAILS).not.toMatch(/setDraftPose/);
    });

    it('uses authoring API for animation mode', () => {
      expect(NODE_DETAILS).toMatch(/useNodeDetailsController/);
      expect(NODE_INSPECTOR_CONTROLLER).toMatch(/inspectorPreview/);
      expect(NODE_INSPECTOR_CONTROLLER).toMatch(/inspectorCommit/);
    });
  });

  describe('ShapeKeysPanel', () => {
    it('does not dispatch synthetic KeyboardEvent', () => {
      expect(SHAPE_KEYS_PANEL).not.toMatch(/KeyboardEvent/);
      expect(SHAPE_KEYS_PANEL).not.toMatch(/dispatchEvent.*new/);
    });

    it('does not call setDraftPose directly', () => {
      expect(SHAPE_KEYS_PANEL).not.toMatch(/setDraftPose/);
    });

    it('uses authoring API for animation mode', () => {
      expect(SHAPE_KEYS_PANEL).toMatch(/useShapeKeysController/);
      expect(NODE_INSPECTOR_CONTROLLER).toMatch(/inspectorPreview/);
      expect(NODE_INSPECTOR_CONTROLLER).toMatch(/inspectorCommit/);
    });
  });

  describe('BoneInspector', () => {
    it('does not dispatch synthetic KeyboardEvent', () => {
      expect(BONE_INSPECTOR).not.toMatch(/KeyboardEvent/);
      expect(BONE_INSPECTOR).not.toMatch(/dispatchEvent.*new/);
    });

    it('does not call setDraftPose directly', () => {
      expect(BONE_INSPECTOR).not.toMatch(/setDraftPose/);
    });

    it('uses authoring API for animation mode bone properties', () => {
      expect(BONE_INSPECTOR).toMatch(/useBoneInspectorController/);
      expect(BONE_INSPECTOR_CONTROLLER).toMatch(/inspectorPreview/);
      expect(BONE_INSPECTOR_CONTROLLER).toMatch(/inspectorCommit/);
    });

    it('disables non-authorable fields in animation mode', () => {
      expect(BONE_INSPECTOR).toMatch(/disabled=\{isDisabled\}/);
    });
  });

  describe('IkConstraintInspector', () => {
    it('does not dispatch synthetic KeyboardEvent', () => {
      expect(IK_INSPECTOR).not.toMatch(/KeyboardEvent/);
      expect(IK_INSPECTOR).not.toMatch(/dispatchEvent.*new/);
    });

    it('does not call setDraftPose directly', () => {
      expect(IK_INSPECTOR).not.toMatch(/setDraftPose/);
    });

    it('uses authoring API for animation mode constraint properties', () => {
      expect(IK_INSPECTOR).toMatch(/useIkConstraintInspectorController/);
      expect(IK_INSPECTOR_CONTROLLER).toMatch(/inspectorPreview/);
      expect(IK_INSPECTOR_CONTROLLER).toMatch(/inspectorCommit/);
    });

    it('disables setup-only fields in animation mode', () => {
      expect(IK_INSPECTOR).toMatch(/disabled=\{isAnim\}/);
    });
  });
});
