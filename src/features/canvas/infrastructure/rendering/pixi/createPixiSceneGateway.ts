import { PixiSceneGateway } from "./PixiSceneGateway.js";

import type { PixiSceneGatewayOptions } from "./PixiSceneGateway.types.js";

export function createPixiSceneGateway(
  options: PixiSceneGatewayOptions,
): PixiSceneGateway {
  return new PixiSceneGateway(options);
}
