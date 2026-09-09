#!/usr/bin/env -S npx tsx

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type { Readable, Writable } from "node:stream";

import { PNG } from "pngjs3";

import {
  DEFAULT_MODULAR_SPRITE_RECIPE,
  type ModularSpriteProcessingRecipe,
} from "@kukla2d/contracts";

import type { RgbaImageData } from "../src/features/modular-sprite/domain/contracts.types.js";
import { analyzeModularSpriteBackground } from "../src/features/modular-sprite/domain/processing/backgroundAnalysis.js";
import { processModularSprite } from "../src/features/modular-sprite/domain/processing/pipeline.js";

interface CliOptions {
  input: string;
  output: string;
  recipe?: string;
  matteOutput?: string;
  recipeOutput?: string;
  autoKey?: boolean;
  overrides: string[];
}

type RuntimePng = PNG &
  Writable & {
    data: Buffer;
    pack(): Readable;
  };

const HELP = `Usage:
  npm run modular-sprite:process -- --input source.png --output result.png [options]

Options:
  --recipe FILE          Merge a full or partial JSON recipe over the defaults
  --set PATH=VALUE       Override any recipe value; may be repeated
  --auto-key             Detect mode and key color even when --recipe is used
  --no-auto-key          Keep the default/recipe mode and key color
  --matte-output FILE    Write an opaque grayscale preview of the resulting matte
  --recipe-output FILE   Write the effective recipe for reuse in the Web UI/CLI
  --help                 Show this help

Examples:
  npm run modular-sprite:process -- --input in.png --output out.png
  npm run modular-sprite:process -- --input in.png --output out.png \\
    --set background.tolerance=0.045 --set background.matteChoke=0.06 \\
    --set background.protectIslandInteriors=false
`;

function optionValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${name} requires a value`);
  return value;
}

function parseArgs(args: string[]): CliOptions {
  if (args.includes("--help")) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  let input = "";
  let output = "";
  let recipe: string | undefined;
  let matteOutput: string | undefined;
  let recipeOutput: string | undefined;
  let autoKey: boolean | undefined;
  const overrides: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--input") input = optionValue(args, index++, argument);
    else if (argument === "--output")
      output = optionValue(args, index++, argument);
    else if (argument === "--recipe")
      recipe = optionValue(args, index++, argument);
    else if (argument === "--matte-output")
      matteOutput = optionValue(args, index++, argument);
    else if (argument === "--recipe-output")
      recipeOutput = optionValue(args, index++, argument);
    else if (argument === "--set")
      overrides.push(optionValue(args, index++, argument));
    else if (argument === "--auto-key") autoKey = true;
    else if (argument === "--no-auto-key") autoKey = false;
    else throw new Error(`Unknown argument: ${argument ?? ""}`);
  }
  if (!input || !output) throw new Error("--input and --output are required");
  return {
    input: resolve(input),
    output: resolve(output),
    overrides,
    ...(recipe ? { recipe: resolve(recipe) } : {}),
    ...(matteOutput ? { matteOutput: resolve(matteOutput) } : {}),
    ...(recipeOutput ? { recipeOutput: resolve(recipeOutput) } : {}),
    ...(autoKey === undefined ? {} : { autoKey }),
  };
}

function mergeRecipe(target: unknown, source: unknown): void {
  if (
    typeof target !== "object" ||
    target === null ||
    typeof source !== "object" ||
    source === null ||
    Array.isArray(source)
  )
    throw new Error("Recipe JSON must be an object");
  const targetRecord = target as Record<string, unknown>;
  for (const [key, value] of Object.entries(source)) {
    if (!(key in targetRecord)) throw new Error(`Unknown recipe key: ${key}`);
    const current = targetRecord[key];
    if (
      typeof current === "object" &&
      current !== null &&
      !Array.isArray(current) &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    )
      mergeRecipe(current, value);
    else targetRecord[key] = structuredClone(value);
  }
}

function parseOverrideValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function applyOverride(
  recipe: ModularSpriteProcessingRecipe,
  value: string,
): void {
  const separator = value.indexOf("=");
  if (separator <= 0) throw new Error(`Invalid --set value: ${value}`);
  const path = value.slice(0, separator).split(".");
  const forbidden = new Set(["__proto__", "prototype", "constructor"]);
  let cursor = recipe as unknown as Record<string, unknown>;
  for (const segment of path.slice(0, -1)) {
    if (forbidden.has(segment) || !(segment in cursor))
      throw new Error(`Unknown recipe path: ${path.join(".")}`);
    const next = cursor[segment];
    if (typeof next !== "object" || next === null || Array.isArray(next))
      throw new Error(`Recipe path is not an object: ${segment}`);
    cursor = next as Record<string, unknown>;
  }
  const leaf = path.at(-1) ?? "";
  if (forbidden.has(leaf) || !(leaf in cursor))
    throw new Error(`Unknown recipe path: ${path.join(".")}`);
  cursor[leaf] = parseOverrideValue(value.slice(separator + 1));
}

function decodePng(file: string): Promise<RgbaImageData> {
  return new Promise((resolvePromise, reject) => {
    const png = new PNG({}) as RuntimePng;
    createReadStream(file)
      .on("error", reject)
      .pipe(png)
      .on("parsed", function parsed(this: RuntimePng) {
        resolvePromise({
          width: this.width,
          height: this.height,
          data: new Uint8ClampedArray(this.data),
        });
      })
      .on("error", reject);
  });
}

function encodePng(file: string, image: RgbaImageData): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const png = new PNG({
      width: image.width,
      height: image.height,
      colorType: 6,
      inputColorType: 6,
      inputHasAlpha: true,
    }) as RuntimePng;
    png.data = Buffer.from(image.data);
    const output = createWriteStream(file);
    output.on("finish", resolvePromise).on("error", reject);
    png.on("error", reject);
    png.pack().pipe(output);
  });
}

function mattePreview(
  matte: Uint8ClampedArray,
  width: number,
  height: number,
): RgbaImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixelIndex = 0; pixelIndex < matte.length; pixelIndex += 1) {
    const value = matte[pixelIndex] ?? 0;
    const offset = pixelIndex * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return { width, height, data };
}

async function effectiveRecipe(
  options: CliOptions,
  image: RgbaImageData,
): Promise<ModularSpriteProcessingRecipe> {
  const recipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
  const shouldAutoKey = options.autoKey ?? !options.recipe;
  if (options.recipe) {
    const saved = JSON.parse(await readFile(options.recipe, "utf8")) as unknown;
    mergeRecipe(recipe, saved);
  }
  if (shouldAutoKey) {
    const detected = analyzeModularSpriteBackground(image);
    recipe.background.mode = detected.mode;
    recipe.background.color = detected.color;
  }
  for (const override of options.overrides) applyOverride(recipe, override);
  return recipe;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const image = await decodePng(options.input);
  const recipe = await effectiveRecipe(options, image);
  const started = performance.now();
  const result = processModularSprite({ image, recipe });
  await mkdir(dirname(options.output), { recursive: true });
  await encodePng(options.output, {
    width: result.width,
    height: result.height,
    data: result.rgba,
  });
  if (options.matteOutput) {
    await mkdir(dirname(options.matteOutput), { recursive: true });
    await encodePng(
      options.matteOutput,
      mattePreview(result.matte, result.width, result.height),
    );
  }
  if (options.recipeOutput) {
    await mkdir(dirname(options.recipeOutput), { recursive: true });
    await writeFile(
      options.recipeOutput,
      `${JSON.stringify(recipe, null, 2)}\n`,
    );
  }

  let transparentPixels = 0;
  let partialPixels = 0;
  let opaquePixels = 0;
  for (const alpha of result.matte) {
    if (alpha === 0) transparentPixels += 1;
    else if (alpha === 255) opaquePixels += 1;
    else partialPixels += 1;
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        input: options.input,
        output: options.output,
        width: result.width,
        height: result.height,
        background: result.background,
        recipe,
        regions: result.regions.length,
        matte: { transparentPixels, partialPixels, opaquePixels },
        warnings: result.warnings,
        processingMs: Math.round((performance.now() - started) * 10) / 10,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
