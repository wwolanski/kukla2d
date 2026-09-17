import { PixiSceneGateway } from "@/features/canvas/infrastructure/rendering/pixi/PixiSceneGateway.js";
import type { PixiSceneGatewayOptions } from "@/features/canvas/infrastructure/rendering/pixi/PixiSceneGateway.types.js";

export function createPixiSceneGateway(
  options: PixiSceneGatewayOptions,
): PixiSceneGateway {
  return new PixiSceneGateway(options);
}
