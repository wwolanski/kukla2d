import { useCallback } from 'react';

import type { Node, PartNode, Transform } from '@kukla2d/contracts';

import { useEditorStore } from '@/store/editorStore.js';
import { useProjectStore } from '@/store/projectStore.js';

import { inspectorPreview, inspectorCommit } from '@/features/animation/index.js';
import { useWorkflowActor } from '@/features/canvas/index.js';
import {
  rotateLinkedNodeGroup,
  scaleLinkedNodeGroup,
  translateLinkedNodeGroup,
} from '@/features/rigging/index.js';

type TransformField = keyof Transform;

function useNodeDetailsControllerImpl(node: Node) {
  const updateProject = useProjectStore(state => state.updateProject);
  const editorMode = useEditorStore(state => state.editorMode);

  const setOpacity = useCallback((value: number) => {
    if (editorMode === 'animation') {
      inspectorPreview(node.id, 'opacity', value);
      return;
    }
    updateProject(project => {
      const target = project.nodes.find(candidate => candidate.id === node.id);
      if (target) target.opacity = value;
    });
  }, [editorMode, node.id, updateProject]);

  const previewOpacity = useCallback(() => {
    if (editorMode === 'animation') inspectorPreview(node.id, 'opacity', node.opacity);
  }, [editorMode, node.id, node.opacity]);

  const commitOpacity = useCallback(() => {
    if (editorMode === 'animation') inspectorCommit('gesture');
  }, [editorMode]);

  const setVisible = useCallback((visible: boolean) => {
    if (editorMode === 'animation') {
      inspectorPreview(node.id, 'visible', visible);
      inspectorCommit('gesture');
      return;
    }
    updateProject(project => {
      const target = project.nodes.find(candidate => candidate.id === node.id);
      if (target) target.visible = visible;
    });
  }, [editorMode, node.id, updateProject]);

  return { editorMode, setOpacity, previewOpacity, commitOpacity, setVisible };
}

export const useNodeDetailsController = (...args: Parameters<typeof useNodeDetailsControllerImpl>): ReturnType<typeof useNodeDetailsControllerImpl> => useNodeDetailsControllerImpl(...args);

function useTransformInspectorControllerImpl(node: Node) {
  const updateProject = useProjectStore(state => state.updateProject);
  const editorMode = useEditorStore(state => state.editorMode);

  const setTransformField = useCallback((field: TransformField, value: number) => {
    if (editorMode === 'animation') {
      inspectorPreview(node.id, field, value);
      return;
    }
    updateProject(project => {
      const target = project.nodes.find(candidate => candidate.id === node.id);
      if (!target) return;
      const current = target.transform[field];
      if (field === 'x') translateLinkedNodeGroup(project, target.id, value - current, 0);
      else if (field === 'y') translateLinkedNodeGroup(project, target.id, 0, value - current);
      else if (field === 'rotation') rotateLinkedNodeGroup(project, target.id, value - current);
      else if (field === 'scaleX') {
        if (Math.abs(current) > 1e-9) scaleLinkedNodeGroup(project, target.id, value / current, 1);
        else target.transform.scaleX = value;
      } else if (field === 'scaleY') {
        if (Math.abs(current) > 1e-9) scaleLinkedNodeGroup(project, target.id, 1, value / current);
        else target.transform.scaleY = value;
      } else {
        target.transform[field] = value;
      }
    });
  }, [editorMode, node.id, updateProject]);

  const commitTransform = useCallback(() => {
    if (editorMode === 'animation') inspectorCommit('gesture');
  }, [editorMode]);

  const resetTransform = useCallback(() => {
    if (editorMode === 'animation') return;
    updateProject(project => {
      const target = project.nodes.find(candidate => candidate.id === node.id);
      if (target) {
        target.transform = {
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          pivotX: 0,
          pivotY: 0,
        };
      }
    });
  }, [editorMode, node.id, updateProject]);

  return { editorMode, setTransformField, commitTransform, resetTransform };
}

export const useTransformInspectorController = (...args: Parameters<typeof useTransformInspectorControllerImpl>): ReturnType<typeof useTransformInspectorControllerImpl> => useTransformInspectorControllerImpl(...args);

function useTextureInspectorControllerImpl(node: PartNode) {
  const textures = useProjectStore(state => state.project.textures);

  const exportTexture = useCallback(() => {
    const textureId = node.textureId ?? node.id;
    const texture = textures.find(candidate => String(candidate.id) === String(textureId));
    if (!texture) return;
    const link = document.createElement('a');
    link.href = texture.source;
    link.download = `${node.name || node.id}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [node.id, node.name, textures]);

  return { exportTexture };
}

export const useTextureInspectorController = (...args: Parameters<typeof useTextureInspectorControllerImpl>): ReturnType<typeof useTextureInspectorControllerImpl> => useTextureInspectorControllerImpl(...args);

function useShapeKeysControllerImpl(node: PartNode) {
  const { send } = useWorkflowActor();
  const updateProject = useProjectStore(state => state.updateProject);
  const createBlendShape = useProjectStore(state => state.createBlendShape);
  const deleteBlendShape = useProjectStore(state => state.deleteBlendShape);
  const setBlendShapeValue = useProjectStore(state => state.setBlendShapeValue);
  const editorMode = useEditorStore(state => state.editorMode);
  const blendShapeEditMode = useEditorStore(state => state.blendShapeEditMode);
  const activeBlendShapeId = useEditorStore(state => state.activeBlendShapeId);
  const enterBlendShapeEditMode = useEditorStore(state => state.enterBlendShapeEditMode);
  const exitBlendShapeEditMode = useEditorStore(state => state.exitBlendShapeEditMode);

  const addShape = useCallback(() => {
    createBlendShape(node.id, `Key ${(node.blendShapes?.length ?? 0) + 1}`);
  }, [createBlendShape, node.blendShapes?.length, node.id]);

  const deleteShape = useCallback((shapeId: string) => {
    deleteBlendShape(node.id, shapeId);
    if (activeBlendShapeId === shapeId) {
      exitBlendShapeEditMode();
      send({ type: 'EXIT_MESH_EDIT' });
    }
  }, [activeBlendShapeId, deleteBlendShape, exitBlendShapeEditMode, node.id, send]);

  const renameShape = useCallback((shapeId: string, name: string) => {
    updateProject(project => {
      const target = project.nodes.find(candidate => candidate.id === node.id);
      if (target?.type !== 'part') return;
      const shape = target.blendShapes?.find(candidate => candidate.id === shapeId);
      if (shape) shape.name = name;
    });
  }, [node.id, updateProject]);

  const setInfluence = useCallback((shapeId: string, value: number) => {
    if (editorMode === 'animation') inspectorPreview(node.id, `blendShape:${shapeId}`, value);
    else setBlendShapeValue(node.id, shapeId, value);
  }, [editorMode, node.id, setBlendShapeValue]);

  const commitInfluence = useCallback(() => {
    if (editorMode === 'animation') inspectorCommit('gesture');
  }, [editorMode]);

  const enterEditMode = useCallback((shapeId: string) => {
    enterBlendShapeEditMode(shapeId);
    send({ type: 'ENTER_MESH_EDIT' });
    send({ type: 'SET_MESH_SUBMODE', meshSubMode: 'deform' });
  }, [enterBlendShapeEditMode, send]);

  const exitEditMode = useCallback(() => {
    exitBlendShapeEditMode();
    send({ type: 'EXIT_MESH_EDIT' });
  }, [exitBlendShapeEditMode, send]);

  return {
    blendShapeEditMode,
    activeBlendShapeId,
    addShape,
    deleteShape,
    renameShape,
    setInfluence,
    commitInfluence,
    enterEditMode,
    exitEditMode,
  };
}

export const useShapeKeysController = (...args: Parameters<typeof useShapeKeysControllerImpl>): ReturnType<typeof useShapeKeysControllerImpl> => useShapeKeysControllerImpl(...args);
