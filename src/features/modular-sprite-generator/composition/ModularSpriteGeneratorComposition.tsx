import { useEffect, useMemo } from "react";

import { createModularSpriteProcessingApi } from "@/features/modular-sprite/index.js";
import { ModularSpriteGeneratorDialog } from "@/features/modular-sprite-generator/components/ModularSpriteGeneratorDialog.js";

type GeneratorProps = Omit<
  React.ComponentProps<typeof ModularSpriteGeneratorDialog>,
  "image"
>;

export function ModularSpriteGeneratorComposition(
  props: GeneratorProps,
): React.ReactElement {
  const image = useMemo(() => createModularSpriteProcessingApi(), []);
  useEffect(() => () => image.dispose(), [image]);
  return <ModularSpriteGeneratorDialog {...props} image={image} />;
}
