import { describe, it, expect } from "vitest";
import * as CanvasFeature from "@/features/canvas/index.js";

describe("canvas feature API baseline", () => {
  it("feature module imports without throwing", () => {
    expect(CanvasFeature).toBeDefined();
  });

  it("exposes the named CanvasViewport public API", () => {
    expect(typeof CanvasFeature.CanvasViewport).toBe("function");
  });
});
