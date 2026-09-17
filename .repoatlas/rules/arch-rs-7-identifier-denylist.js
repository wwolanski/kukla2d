export function createArchRs7Block({
  source = "src",
  packages = "packages",
  ignores = [],
} = {}) {
  return {
    files: [
      `${source}/**/*.{js,jsx,ts,tsx}`,
      `${packages}/**/*.{js,jsx,ts,tsx}`,
    ],
    ignores,
    rules: {
      "id-denylist": ["error", "ed", "proj", "anim", "kfOv", "drOv"],
    },
  };
}
