export function createModularSpriteCompositionException({
  features = "src/features",
} = {}) {
  return {
    from: {
      file: {
        path: `${features}/modular-sprite/components/ModularSpriteWizard.tsx`,
      },
    },
    allow: { to: { element: { type: "feature-composition" } } },
  };
}
