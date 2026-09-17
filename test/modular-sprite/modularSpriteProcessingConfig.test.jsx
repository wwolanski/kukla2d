// @vitest-environment jsdom
/* eslint-disable react/prop-types -- compact Slider test double */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/slider", () => ({
  Slider: ({ min, max, step, value, disabled, "aria-label": ariaLabel }) => (
    <input
      readOnly
      aria-label={ariaLabel}
      data-processing-slider="true"
      disabled={disabled}
      max={max}
      min={min}
      step={step}
      type="number"
      value={value[0]}
    />
  ),
}));

import { BackgroundStep } from "@/features/modular-sprite/components/wizard/BackgroundStep";
import { TouchupToolbar } from "@/features/modular-sprite/components/wizard/TouchupToolbar";
import {
  assertValidModularSpriteRecipe,
  createDefaultModularSpriteRecipe,
  MODULAR_SPRITE_PROCESSING_CONFIG,
  resolveChromaRefinement,
} from "@kukla2d/contracts";

function mountProcessingControls(recipe) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <>
        <BackgroundStep
          onPickMode={vi.fn()}
          onRecipeChange={vi.fn()}
          onRecipeCommit={vi.fn()}
          recipe={recipe}
          tool="select"
          warnings={[]}
        />
        <TouchupToolbar
          brushRadius={
            MODULAR_SPRITE_PROCESSING_CONFIG.strokes.editorRadius.default
          }
          enclosedChromaSeedCount={0}
          featureDisabled={false}
          onBrushRadiusChange={vi.fn()}
          onClearEnclosedAreas={vi.fn()}
          onToolChange={vi.fn()}
          tool="select"
        />
      </>,
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

function mountBackgroundStep(recipe) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <BackgroundStep
        onPickMode={vi.fn()}
        onRecipeChange={vi.fn()}
        onRecipeCommit={vi.fn()}
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

function sliderFor(container, label) {
  return container.querySelector(
    `[data-processing-slider="true"][aria-label="${label}"]`,
  );
}

function processingSectionFor(container, title) {
  return Array.from(container.querySelectorAll("details")).find((section) =>
    section.querySelector("summary")?.textContent?.includes(title),
  );
}

function disabledAttributeFor(element) {
  return (
    element?.getAttribute("data-disabled") ??
    element?.getAttribute("aria-disabled") ??
    element?.querySelector("summary")?.getAttribute("data-disabled") ??
    element?.querySelector("summary")?.getAttribute("aria-disabled")
  );
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
      enclosedChromaCoreAlphaMax:
        config.background.enclosedChromaCoreAlphaMax.default,
      enclosedChromaCoreColorTolerance:
        config.background.enclosedChromaCoreColorTolerance.default,
      enclosedChromaGrowthRadius:
        config.background.enclosedChromaGrowthRadius.default,
      enclosedChromaGrowthAlphaMax:
        config.background.enclosedChromaGrowthAlphaMax.default,
      enclosedChromaGrowthColorTolerance:
        config.background.enclosedChromaGrowthColorTolerance.default,
      enclosedChromaGrowthChromaTolerance:
        config.background.enclosedChromaGrowthChromaTolerance.default,
      enclosedChromaGrowthHueTolerance:
        config.background.enclosedChromaGrowthHueTolerance.default,
      enclosedChromaGrowthMinChromaRatio:
        config.background.enclosedChromaGrowthMinChromaRatio.default,
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
    delete recipe.background.enclosedChromaCoreAlphaMax;
    delete recipe.background.enclosedChromaCoreColorTolerance;
    delete recipe.background.enclosedChromaGrowthRadius;
    delete recipe.background.enclosedChromaGrowthAlphaMax;
    delete recipe.background.enclosedChromaGrowthColorTolerance;
    delete recipe.background.enclosedChromaGrowthChromaTolerance;
    delete recipe.background.enclosedChromaGrowthHueTolerance;
    delete recipe.background.enclosedChromaGrowthMinChromaRatio;

    expect(resolveChromaRefinement(recipe.background)).toEqual({
      enclosedChromaMode: "preserve",
      enclosedChromaSeeds: [],
      enclosedChromaCoreAlphaMax:
        MODULAR_SPRITE_PROCESSING_CONFIG.background.enclosedChromaCoreAlphaMax
          .default,
      enclosedChromaCoreColorTolerance:
        MODULAR_SPRITE_PROCESSING_CONFIG.background
          .enclosedChromaCoreColorTolerance.default,
      enclosedChromaGrowthRadius:
        MODULAR_SPRITE_PROCESSING_CONFIG.background.enclosedChromaGrowthRadius
          .default,
      enclosedChromaGrowthAlphaMax:
        MODULAR_SPRITE_PROCESSING_CONFIG.background.enclosedChromaGrowthAlphaMax
          .default,
      enclosedChromaGrowthColorTolerance:
        MODULAR_SPRITE_PROCESSING_CONFIG.background
          .enclosedChromaGrowthColorTolerance.default,
      enclosedChromaGrowthChromaTolerance:
        MODULAR_SPRITE_PROCESSING_CONFIG.background
          .enclosedChromaGrowthChromaTolerance.default,
      enclosedChromaGrowthHueTolerance:
        MODULAR_SPRITE_PROCESSING_CONFIG.background
          .enclosedChromaGrowthHueTolerance.default,
      enclosedChromaGrowthMinChromaRatio:
        MODULAR_SPRITE_PROCESSING_CONFIG.background
          .enclosedChromaGrowthMinChromaRatio.default,
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

  it("validates enclosed chroma fields and exposes its recipe heuristics", () => {
    const config = MODULAR_SPRITE_PROCESSING_CONFIG;
    expect(config.background).toMatchObject({
      enclosedChromaCoreAlphaMax: {
        default: 32,
        min: 1,
        max: 254,
        step: 1,
      },
      enclosedChromaCoreColorTolerance: {
        default: 0.13,
        min: 0,
        max: 0.5,
        step: 0.01,
      },
      enclosedChromaGrowthRadius: {
        default: 2,
        min: 0,
        max: 8,
        step: 1,
      },
      enclosedChromaGrowthAlphaMax: {
        default: 254,
        min: 0,
        max: 254,
        step: 1,
      },
      enclosedChromaGrowthColorTolerance: {
        default: 0.24,
        min: 0,
        max: 0.5,
        step: 0.01,
      },
      enclosedChromaGrowthChromaTolerance: {
        default: 0.16,
        min: 0,
        max: 0.5,
        step: 0.01,
      },
      enclosedChromaGrowthHueTolerance: {
        default: 12,
        min: 0,
        max: 90,
        step: 1,
      },
      enclosedChromaGrowthMinChromaRatio: {
        default: 0.2,
        min: 0,
        max: 1,
        step: 0.01,
      },
    });
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
    expect(config.algorithm).not.toHaveProperty("enclosedChromaCoreAlphaMax");
    expect(config.algorithm).not.toHaveProperty(
      "enclosedChromaMaxPixelDistance",
    );
    expect(config.algorithm).not.toHaveProperty(
      "enclosedChromaExpansionRadius",
    );

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
    for (const [field, parameter] of Object.entries({
      enclosedChromaCoreAlphaMax: config.background.enclosedChromaCoreAlphaMax,
      enclosedChromaCoreColorTolerance:
        config.background.enclosedChromaCoreColorTolerance,
      enclosedChromaGrowthRadius: config.background.enclosedChromaGrowthRadius,
      enclosedChromaGrowthAlphaMax:
        config.background.enclosedChromaGrowthAlphaMax,
      enclosedChromaGrowthColorTolerance:
        config.background.enclosedChromaGrowthColorTolerance,
      enclosedChromaGrowthChromaTolerance:
        config.background.enclosedChromaGrowthChromaTolerance,
      enclosedChromaGrowthHueTolerance:
        config.background.enclosedChromaGrowthHueTolerance,
      enclosedChromaGrowthMinChromaRatio:
        config.background.enclosedChromaGrowthMinChromaRatio,
    })) {
      expect(() =>
        assertValidModularSpriteRecipe({
          ...recipe,
          background: {
            ...recipe.background,
            [field]: parameter.min - parameter.step,
          },
        }),
      ).toThrow();
    }
  });

  it("renders existing alpha as a transparent background and disables chroma controls", () => {
    const recipe = createDefaultModularSpriteRecipe();
    recipe.background.mode = "alpha";
    const view = mountBackgroundStep(recipe);

    const mode = view.container.querySelector('select[aria-label="Mode"]');
    expect(mode?.querySelector('option[value="alpha"]')?.textContent).toBe(
      "Existing alpha (transparent)",
    );

    const transparent = view.container.querySelector(
      '[role="img"][aria-label="Transparent"]',
    );
    expect(transparent).not.toBeNull();
    expect(transparent?.textContent).toContain("Transparent");
    expect(transparent?.getAttribute("class")).toContain("linear-gradient");
    expect(view.container.querySelector('input[type="color"]')).toBeNull();

    const picker = view.container.querySelector(
      'button[aria-label="Pick background color from image"]',
    );
    expect(picker?.disabled).toBe(true);

    for (const label of [
      "Tolerance",
      "Soft edge",
      "Interior inset",
      "Core alpha maximum",
      "Core color tolerance",
      "Growth radius",
      "Growth alpha maximum",
      "Growth color tolerance",
      "Growth chroma tolerance",
      "Growth hue tolerance",
      "Minimum chroma ratio",
      "Despill",
      "Matte choke",
      "Edge color recovery",
      "Edge search",
    ]) {
      expect(sliderFor(view.container, label)).not.toBeNull();
      expect(sliderFor(view.container, label)?.disabled).toBe(true);
    }

    const protectIslandInteriors = view.container.querySelector(
      'input[type="checkbox"]',
    );
    expect(protectIslandInteriors?.disabled).toBe(true);
    expect(
      view.container.querySelector(
        'select[aria-label="Enclosed chroma inside protected areas"]',
      )?.disabled,
    ).toBe(true);
    const resetEnclosedChroma = Array.from(
      view.container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Reset enclosed chroma"));
    expect(resetEnclosedChroma?.disabled).toBe(true);

    const edgeCleanup = processingSectionFor(view.container, "Edge cleanup");
    expect(edgeCleanup).not.toBeNull();
    expect(disabledAttributeFor(edgeCleanup)).toBe("true");
    expect(edgeCleanup?.open).toBe(false);

    const protectIslandInteriorsSection = processingSectionFor(
      view.container,
      "Protect island interiors",
    );
    expect(protectIslandInteriorsSection).not.toBeNull();
    expect(protectIslandInteriorsSection?.open).toBe(false);

    const enclosedChromaTuning = processingSectionFor(
      view.container,
      "Enclosed chroma tuning",
    );
    expect(enclosedChromaTuning).not.toBeNull();
    expect(disabledAttributeFor(enclosedChromaTuning)).toBe("true");
    expect(enclosedChromaTuning?.open).toBe(false);

    expect(sliderFor(view.container, "Detection alpha")?.disabled).toBe(false);
    view.unmount();
  });

  it("keeps background color picking and chroma controls enabled in chroma mode", () => {
    const recipe = createDefaultModularSpriteRecipe();
    recipe.background.mode = "chroma";
    const view = mountBackgroundStep(recipe);

    expect(view.container.querySelector('input[type="color"]')).not.toBeNull();
    expect(
      view.container.querySelector(
        'button[aria-label="Pick background color from image"]',
      )?.disabled,
    ).toBe(false);
    for (const label of [
      "Tolerance",
      "Soft edge",
      "Interior inset",
      "Despill",
      "Matte choke",
      "Edge color recovery",
      "Edge search",
    ]) {
      expect(sliderFor(view.container, label)?.disabled).toBe(false);
    }
    const edgeCleanup = processingSectionFor(view.container, "Edge cleanup");
    expect(edgeCleanup).not.toBeNull();
    expect(disabledAttributeFor(edgeCleanup)).not.toBe("true");
    expect(
      view.container.querySelector('input[type="checkbox"]')?.disabled,
    ).toBe(false);
    expect(
      view.container.querySelector(
        'select[aria-label="Enclosed chroma inside protected areas"]',
      )?.disabled,
    ).toBe(false);

    view.unmount();
  });

  it("renders every numeric Web UI control directly from the config", () => {
    const config = MODULAR_SPRITE_PROCESSING_CONFIG;
    const expected = [
      config.background.tolerance,
      config.background.softness,
      config.background.interiorProtectionInset,
      config.background.enclosedChromaCoreAlphaMax,
      config.background.enclosedChromaCoreColorTolerance,
      config.background.enclosedChromaGrowthRadius,
      config.background.enclosedChromaGrowthAlphaMax,
      config.background.enclosedChromaGrowthColorTolerance,
      config.background.enclosedChromaGrowthChromaTolerance,
      config.background.enclosedChromaGrowthHueTolerance,
      config.background.enclosedChromaGrowthMinChromaRatio,
      config.background.despill,
      config.background.matteChoke,
      config.background.edgeColorRecovery,
      config.background.edgeSearchRadius,
      config.detection.alphaThreshold,
      config.detection.openingRadius,
      config.detection.closingRadius,
      config.detection.minimumRegionAreaRatio,
      config.strokes.editorRadius,
    ];
    const view = mountProcessingControls(createDefaultModularSpriteRecipe());
    act(() => {
      view.container
        .querySelector('button[aria-label="Brush radius"]')
        ?.click();
    });
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
