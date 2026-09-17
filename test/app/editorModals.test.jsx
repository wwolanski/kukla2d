// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/projects/index.js', async () => {
  const { lazy } = await import('react');
  return {
    publishProjectSchemasToLocalDatabase: vi.fn(),
    SaveModal: lazy(async () => ({
      default: () => <div data-testid="save-modal">Save modal</div>,
    })),
  };
});

import { EditorModals } from '@/app/layout/components/EditorModals.jsx';

const noop = () => {};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('EditorModals', () => {
  it('renders the lazy SaveModal from the projects public API without wrapping it again', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <EditorModals
          exportModalOpen={false}
          setExportModalOpen={noop}
          preferencesOpen={false}
          setPreferencesOpen={noop}
          schemaLibraryOpen={false}
          setSchemaLibraryOpen={noop}
          projectSession={{
            saveModalOpen: true,
            closeSaveModal: noop,
            loadModalOpen: false,
            closeLoadModal: noop,
            currentDbProjectId: null,
            currentDbProjectName: null,
            handleSavedToDb: noop,
            handleSaveSuccess: noop,
            handleLoadFromDb: noop,
            handleLoadFromFile: noop,
            finalizeLoadFile: noop,
            confirmWipe: { open: false, type: null, data: null },
            confirmStore: { open: false, file: null },
            handleConfirmWipe: noop,
            closeConfirmWipe: noop,
            closeConfirmStore: noop,
          }}
          project={{}}
          exportCaptureRef={{ current: null }}
          thumbCaptureRef={{ current: null }}
          importRef={{ current: null }}
          modularSpriteEditor={{ open: false, highlightFirstExample: false }}
          setModularSpriteEditor={noop}
          modularSpriteGenerator={{ open: false, intent: null }}
          setModularSpriteGenerator={noop}
        />,
      );
    });

    expect(document.querySelector('[data-testid="save-modal"]')).not.toBeNull();

    act(() => root.unmount());
  });
});
