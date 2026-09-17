import { useEffect, useRef } from 'react';

import { useAnimationStore } from '@/store/animationStore.js';
import { useProjectStore } from '@/store/projectStore.js';

/**
 * Supervises Export Area move mode as a modal canvas tool.
 * Any competing tool/mode transition or animation mutation commits the
 * already-persisted rectangle by ending the session.
 */
interface ExportAreaMoveSessionOptions {
  active: boolean;
  activeTool: string;
  editorMode: string;
  finish: () => void;
}

interface ExportAreaMoveBaseline { activeTool: string; editorMode: string }

export function useExportAreaMoveSession({ active, activeTool, editorMode, finish }: ExportAreaMoveSessionOptions): void {
  const baselineRef = useRef<ExportAreaMoveBaseline | null>(null);

  useEffect(() => {
    if (!active) {
      baselineRef.current = null;
      return;
    }
    if (!baselineRef.current) {
      baselineRef.current = { activeTool, editorMode };
      return;
    }
    const baseline = baselineRef.current;
    if (baseline.activeTool !== activeTool || baseline.editorMode !== editorMode) {
      finish();
    }
  }, [active, activeTool, editorMode, finish]);

  useEffect(() => {
    if (!active) return undefined;
    const initialAnimations = useProjectStore.getState().project.animations;

    const unsubscribeAnimation = useAnimationStore.subscribe(() => finish());
    const unsubscribeProject = useProjectStore.subscribe((state) => {
      if (state.project.animations !== initialAnimations) finish();
    });

    return () => {
      unsubscribeAnimation();
      unsubscribeProject();
    };
  }, [active, finish]);
}
