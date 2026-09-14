export function createAppVersionGlobalBlock() {
  return {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      globals: { __APP_VERSION__: "readonly" },
    },
  };
}
