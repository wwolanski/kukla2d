export function createCanvasPropTypesBlock({ features = "src/features" } = {}) {
  const files = [`${features}/canvas/**/*.{js,jsx}`];
  return {
    files,
    rules: { "react/prop-types": "off" },
  };
}
