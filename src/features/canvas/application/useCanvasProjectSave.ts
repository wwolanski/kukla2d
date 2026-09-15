import { useCallback } from 'react';

import type { ProjectDocument } from '@kukla2d/contracts';

import { buildProjectFileName } from '@/io/projectFormat.js';

import type { RefObject } from 'react';

export function useCanvasProjectSave(
  projectRef: RefObject<ProjectDocument>,
  notifyError: (error: unknown) => void,
): () => Promise<void> {
  return useCallback(async () => {
    try {
      const { saveProject } = await import('@/io/projectFile.js');
      const blob = await saveProject(projectRef.current);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = buildProjectFileName('project');
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      notifyError(error);
    }
  }, [notifyError, projectRef]);
}
