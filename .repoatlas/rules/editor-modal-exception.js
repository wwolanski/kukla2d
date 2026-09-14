export function createEditorModalException({
  source = "src",
  alias = "@",
} = {}) {
  const aliasPath = (suffix) => `${alias}/${suffix}`;
  return {
    from: {
      file: { path: `${source}/app/layout/components/EditorModals.jsx` },
    },
    allow: {
      dependency: {
        source: [
          aliasPath("features/export/components/ExportModal"),
          aliasPath("features/modular-sprite/wizard"),
          aliasPath("features/preferences/components/PreferencesModal"),
          aliasPath("features/projects/components/LoadModal"),
          aliasPath("features/projects/components/SaveModal"),
        ],
      },
    },
  };
}
