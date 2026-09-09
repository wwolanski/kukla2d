// @vitest-environment jsdom
/* eslint-disable react/prop-types -- compact Slider test double */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/slider", () => ({
  Slider: ({ min, max, step, value }) => (
    <input
      readOnly
      data-processing-slider="true"
      max={max}
      min={min}
      step={step}
      type="number"
      value={value[0]}
    />
  ),
}));

import { BackgroundStep } from "@/features/modular-sprite/components/wizard/BackgroundStep";
import {
  assertValidModularSpriteRecipe,
  createDefaultModularSpriteRecipe,
  MODULAR_SPRITE_PROCESSING_CONFIG,
  resolveChromaRefinement,
} from "@kukla2d/contracts";

function mountBackgroundStep(recipe) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <BackgroundStep
        brushRadius={
          MODULAR_SPRITE_PROCESSING_CONFIG.strokes.editorRadius.default
        }
        onBrushRadiusChange={vi.fn()}
        onPickMode={vi.fn()}
        onRecipeChange={vi.fn()}
        onRecipeCommit={vi.fn()}
        onToolChange={vi.fn()}
        recipe={recipe}
        tool="select"
        warnings={[]}
      />,
    );
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("modular sprite processing configuration", () => {
  it("builds every recipe default from the central configuration", () => {
    const config = MODULAR_SPRITE_PROCESSING_CONFIG;
    const recipe = createDefaultModularSpriteRecipe();
    const refinement = resolveChromaRefinement(recipe.background);

    expect(recipe.background).toEqual({
      mode: config.background.mode.default,
      color: config.background.color.default,
      tolerance: config.background.tolerance.default,
      softness: config.background.softness.default,
      despill: config.background.despill.default,
      enclosedChromaMode: "transparent",
      enclosedChromaSeeds: [],
      protectIslandInteriors: config.background.protectIslandInteriors.default,
      interiorProtectionInset:
        config.background.interiorProtectionInset.default,
      matteChoke: config.background.matteChoke.default,
      edgeColorRecovery: config.background.edgeColorRecovery.default,
      edgeSearchRadius: config.background.edgeSearchRadius.default,
    });
    expect(recipe.detection).toEqual({
      alphaThreshold: config.detection.alphaThreshold.default,
      minimumRegionAreaRatio: config.detection.minimumRegionAreaRatio.default,
      openingRadius: config.detection.openingRadius.default,
      closingRadius: config.detection.closingRadius.default,
      connectivity: config.detection.connectivity.default,
    });
    expect(refinement).toMatchObject({
      enclosedChromaMode: "transparent",
      enclosedChromaSeeds: [],
      protectIslandInteriors: true,
    });
  });

  it("uses the same defaults for legacy recipes without refinement fields", () => {
    const recipe = createDefaultModularSpriteRecipe();
    delete recipe.background.protectIslandInteriors;
    delete recipe.background.interiorProtectionInset;
    delete recipe.background.matteChoke;
    delete recipe.background.edgeColorRecovery;
    delete recipe.background.edgeSearchRadius;
    delete recipe.background.enclosedChromaMode;
    delete recipe.background.enclosedChromaSeeds;

    expect(resolveChromaRefinement(recipe.background)).toEqual({
      enclosedChromaMode: "preserve",
      enclosedChromaSeeds: [],
      protectIslandInteriors:
        MODULAR_SPRITE_PROCESSING_CONFIG.background.protectIslandInteriors
          .default,
      interiorProtectionInset:
        MODULAR_SPRITE_PROCESSING_CONFIG.background.interiorProtectionInset
          .default,
      matteChoke:
        MODULAR_SPRITE_PROCESSING_CONFIG.background.matteChoke.default,
      edgeColorRecovery:
        MODULAR_SPRITE_PROCESSING_CONFIG.background.edgeColorRecovery.default,
      edgeSearchRadius:
        MODULAR_SPRITE_PROCESSING_CONFIG.background.edgeSearchRadius.default,
    });
  });

  it("validates enclosed chroma fields and exposes its algorithm heuristics", () => {
    const config = MODULAR_SPRITE_PROCESSING_CONFIG;
    expect(config.algorithm).toMatchObject({
      enclosedChromaStrongDistance: 0.05,
      enclosedChromaMeanDistance: 0.08,
      enclosedChromaStrongRatio: 0.7,
      enclosedChromaColorSpread: 0.06,
      enclosedChromaSmallArea: 64,
      enclosedChromaSmallMeanDistance: 0.13,
      enclosedChromaSmallStrongRatio: 0.1,
      enclosedChromaSmallColorSpread: 0.09,
    });

    const recipe = createDefaultModularSpriteRecipe();
    recipe.background.enclosedChromaMode = "black";
    recipe.background.enclosedChromaSeeds = [{ x: 0.25, y: 0.75 }];
    expect(() => assertValidModularSpriteRecipe(recipe)).not.toThrow();

    expect(() =>
      assertValidModularSpriteRecipe({
        ...recipe,
        background: { ...recipe.background, enclosedChromaMode: "invalid" },
      }),
    ).toThrow();
    expect(() =>
      assertValidModularSpriteRecipe({
        ...recipe,
        background: {
          ...recipe.background,
          enclosedChromaSeeds: [{ x: 1.01, y: 0.5 }],
        },
      }),
    ).toThrow();
  });

  it("renders every numeric Web UI control directly from the config", () => {
    const config = MODULAR_SPRITE_PROCESSING_CONFIG;
    const expected = [
      config.background.tolerance,
      config.background.softness,
      config.background.despill,
      config.background.interiorProtectionInset,
      config.background.matteChoke,
      config.background.edgeColorRecovery,
      config.background.edgeSearchRadius,
      config.detection.alphaThreshold,
      config.detection.openingRadius,
      config.detection.closingRadius,
      config.detection.minimumRegionAreaRatio,
      config.strokes.editorRadius,
    ];
    const view = mountBackgroundStep(createDefaultModularSpriteRecipe());
    const sliders = Array.from(
      view.container.querySelectorAll('[data-processing-slider="true"]'),
    );

    expect(sliders).toHaveLength(expected.length);
    sliders.forEach((slider, index) => {
      const parameter = expected[index];
      expect(slider.min).toBe(String(parameter.min));
      expect(slider.max).toBe(String(parameter.max));
      expect(slider.step).toBe(String(parameter.step));
      expect(slider.valueAsNumber).toBe(parameter.default);
    });
    view.unmount();
  });
});
