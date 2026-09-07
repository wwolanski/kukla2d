import { describe, expect, it } from "vitest";
import { resolveExportEncoder } from "@/features/export/composition/exportInfrastructure";
import { encodePngSequence } from "@/features/export/infrastructure/encodePngSequence";
import { encodeGif } from "@/features/export/infrastructure/encodeGif";
import { encodePngSpritesheet } from "@/features/export/infrastructure/encodePngSpritesheet";

describe("resolveExportEncoder", () => {
  it("returns encodePngSequence for png_sequence variant", () => {
    const encoder = resolveExportEncoder("png_sequence");
    expect(encoder).toBe(encodePngSequence);
  });

  it("returns encodeGif for gif variant", () => {
    const encoder = resolveExportEncoder("gif");
    expect(encoder).toBe(encodeGif);
  });

  it("returns encodePngSpritesheet for png_spritesheet variant", () => {
    const encoder = resolveExportEncoder("png_spritesheet");
    expect(encoder).toBe(encodePngSpritesheet);
  });

  it("throws for unknown variant", () => {
    expect(() => resolveExportEncoder("unknown")).toThrow(
      "No encoder registered for variant: unknown",
    );
  });

  it("throws for legacy variant without encoder", () => {
    expect(() => resolveExportEncoder("live2d_project")).toThrow(
      "No encoder registered for variant: live2d_project",
    );
    expect(() => resolveExportEncoder("live2d")).toThrow(
      "No encoder registered for variant: live2d",
    );
    expect(() => resolveExportEncoder("spine")).toThrow(
      "No encoder registered for variant: spine",
    );
    expect(() => resolveExportEncoder("phaser_atlas")).toThrow(
      "No encoder registered for variant: phaser_atlas",
    );
  });
});
