export function createArchRs6Block({ features = "src/features" } = {}) {
  return {
    files: [`${features}/canvas/**/*.{js,jsx,ts,tsx}`],
    rules: {
      "max-lines": [
        "error",
        {
          max: 1000,
          skipBlankLines: false,
          skipComments: false,
        },
      ],
    },
  };
}
