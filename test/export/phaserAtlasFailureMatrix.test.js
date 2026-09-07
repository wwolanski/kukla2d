import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createPhaserAtlasExportPlan } from "@/features/export/domain/phaserAtlasExportPlan";
import { runPhaserAtlasExport } from "@/features/export/application/runPhaserAtlasExport";
import {
  validatePhaserAtlasOptions,
  PHASER_ATLAS_ERROR_CODES,
} from "@/features/export/domain/phaserAtlasContract";
import { packAtlasFrames } from "../../packages/adapters/phaser-atlas/src/domain/phaserAtlasPacker.js";

function makeArea(w = 100, h = 100) {
  return {
    source: { x: 0, y: 0, width: w, height: w },
    outputWidth: w,
    outputHeight: h,
  };
}

function makeAnimations(count = 1) {
  const anims = [];
  for (let i = 0; i < count; i++) {
    anims.push({ id: `anim-${i}`, name: `clip${i}`, duration: 1000 });
  }
  return anims;
}

function successCapture(req) {
  return {
    ok: true,
    dataUrl: `data:image/png;base64,${req.timeMs}`,
    width: req.width,
    height: req.height,
  };
}

function makeAdapter() {
  return vi.fn(async () => ({
    ok: true,
    artifacts: [
      {
        fileName: "test.png",
        mimeType: "image/png",
        blob: new Blob(),
        relativePath: "test/test.png",
      },
      {
        fileName: "test.atlas.json",
        mimeType: "application/json",
        blob: new Blob(),
        relativePath: "test/test.atlas.json",
      },
      {
        fileName: "test.animations.json",
        mimeType: "application/json",
        blob: new Blob(),
        relativePath: "test/test.animations.json",
      },
      {
        fileName: "test.markers.json",
        mimeType: "application/json",
        blob: new Blob(),
        relativePath: "test/test.markers.json",
      },
      {
        fileName: "test.export-report.json",
        mimeType: "application/json",
        blob: new Blob(),
        relativePath: "test/test.export-report.json",
      },
      {
        fileName: "test.example.ts",
        mimeType: "text/typescript",
        blob: new Blob(),
        relativePath: "test/test.example.ts",
      },
      {
        fileName: "README.md",
        mimeType: "text/markdown",
        blob: new Blob(),
        relativePath: "test/README.md",
      },
    ],
  }));
}

describe("Phaser atlas failure matrix", () => {
  beforeEach(() => {
    if (typeof globalThis.ImageData === "undefined") {
      vi.stubGlobal(
        "ImageData",
        class ImageData {
          constructor(data, w, h) {
            this.data = data;
            this.width = w;
            this.height = h;
          }
        },
      );
    }
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("plan validation", () => {
    it("throws when no animations provided", () => {
      expect(() =>
        createPhaserAtlasExportPlan({
          area: makeArea(),
          fps: 24,
          scale: 100,
          animations: [],
          trim: true,
          padding: 2,
          maxPageSize: 2048,
          loop: true,
          outputName: "test",
          destination: "zip",
        }),
      ).toThrow(/at least one animation/i);
    });

    it("throws when area has zero width", () => {
      expect(() =>
        createPhaserAtlasExportPlan({
          area: {
            source: { x: 0, y: 0, width: 0, height: 100 },
            outputWidth: 0,
            outputHeight: 100,
          },
          fps: 24,
          scale: 100,
          animations: makeAnimations(),
          trim: true,
          padding: 2,
          maxPageSize: 2048,
          loop: true,
          outputName: "test",
          destination: "zip",
        }),
      ).toThrow(/positive/i);
    });

    it("throws when fps is out of range", () => {
      expect(() =>
        createPhaserAtlasExportPlan({
          area: makeArea(),
          fps: 0,
          scale: 100,
          animations: makeAnimations(),
          trim: true,
          padding: 2,
          maxPageSize: 2048,
          loop: true,
          outputName: "test",
          destination: "zip",
        }),
      ).toThrow(/fps/i);
    });

    it("throws when maxPageSize is invalid", () => {
      expect(() =>
        createPhaserAtlasExportPlan({
          area: makeArea(),
          fps: 24,
          scale: 100,
          animations: makeAnimations(),
          trim: true,
          padding: 2,
          maxPageSize: 512,
          loop: true,
          outputName: "test",
          destination: "zip",
        }),
      ).toThrow(/maxPageSize/i);
    });

    it("normalizes download to zip", () => {
      const plan = createPhaserAtlasExportPlan({
        area: makeArea(),
        fps: 24,
        scale: 100,
        animations: makeAnimations(),
        trim: true,
        padding: 2,
        maxPageSize: 2048,
        loop: true,
        outputName: "test",
        destination: "download",
      });
      expect(plan.destination).toBe("zip");
    });
  });

  describe("option validation", () => {
    it("returns NO_ANIMATIONS for empty array", () => {
      const errors = validatePhaserAtlasOptions({
        fps: 24,
        scale: 100,
        padding: 2,
        maxPageSize: 2048,
        animations: [],
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe(PHASER_ATLAS_ERROR_CODES.NO_ANIMATIONS);
    });

    it("returns INVALID_OPTION for fps below minimum", () => {
      const errors = validatePhaserAtlasOptions({
        fps: 0,
        scale: 100,
        padding: 2,
        maxPageSize: 2048,
        animations: [{ id: "1", name: "a" }],
      });
      expect(
        errors.some(
          (e) =>
            e.code === PHASER_ATLAS_ERROR_CODES.INVALID_OPTION &&
            e.path === "fps",
        ),
      ).toBe(true);
    });

    it("returns INVALID_OPTION for non-integer padding", () => {
      const errors = validatePhaserAtlasOptions({
        fps: 24,
        scale: 100,
        padding: 1.5,
        maxPageSize: 2048,
        animations: [{ id: "1", name: "a" }],
      });
      expect(errors.some((e) => e.path === "padding")).toBe(true);
    });

    it("returns INVALID_OPTION for invalid maxPageSize", () => {
      const errors = validatePhaserAtlasOptions({
        fps: 24,
        scale: 100,
        padding: 2,
        maxPageSize: 1024,
        animations: [{ id: "1", name: "a" }],
      });
      expect(errors.some((e) => e.path === "maxPageSize")).toBe(true);
    });
  });

  describe("adapter error propagation", () => {
    it("returns OVERSIZED_FRAME for frame exceeding maxPageSize", () => {
      const result = packAtlasFrames(
        [
          {
            identity: "big",
            cropX: 0,
            cropY: 0,
            cropW: 100,
            cropH: 100,
            sourceWidth: 100,
            sourceHeight: 100,
            empty: false,
          },
        ],
        0,
        64,
      );
      expect("code" in result).toBe(true);
      expect(result.code).toBe("PHASER_ATLAS_OVERSIZED_FRAME");
    });

    it("returns DUPLICATE_KEY for colliding identities", () => {
      const result = packAtlasFrames(
        [
          {
            identity: "same",
            cropX: 0,
            cropY: 0,
            cropW: 10,
            cropH: 10,
            sourceWidth: 10,
            sourceHeight: 10,
            empty: false,
          },
          {
            identity: "same",
            cropX: 0,
            cropY: 0,
            cropW: 10,
            cropH: 10,
            sourceWidth: 10,
            sourceHeight: 10,
            empty: false,
          },
        ],
        0,
        2048,
      );
      expect("code" in result).toBe(true);
      expect(result.code).toBe("PHASER_ATLAS_DUPLICATE_KEY");
    });
  });

  describe("orchestrator error paths", () => {
    it("returns error when capture throws", async () => {
      const result = await runPhaserAtlasExport({
        plan: createPhaserAtlasExportPlan({
          area: makeArea(),
          fps: 2,
          scale: 100,
          animations: makeAnimations(),
          trim: true,
          padding: 2,
          maxPageSize: 2048,
          loop: true,
          outputName: "test",
          destination: "zip",
        }),
        captureFrame: () => {
          throw new Error("Canvas destroyed");
        },
        adapter: makeAdapter(),
        outputSink: vi.fn(),
      });

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("EXPORT_FAILED");
      expect(result.error.message).toBe("Canvas destroyed");
    });

    it("returns error when adapter returns typed error", async () => {
      const adapter = vi.fn(async () => ({
        ok: false,
        code: "PHASER_ATLAS_OVERSIZED_FRAME",
        message: "Too large",
      }));

      const result = await runPhaserAtlasExport({
        plan: createPhaserAtlasExportPlan({
          area: makeArea(),
          fps: 2,
          scale: 100,
          animations: makeAnimations(),
          trim: true,
          padding: 2,
          maxPageSize: 2048,
          loop: true,
          outputName: "test",
          destination: "zip",
        }),
        captureFrame: vi.fn(successCapture),
        adapter,
        outputSink: vi.fn(),
      });

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("PHASER_ATLAS_OVERSIZED_FRAME");
    });

    it("does not call sink when adapter fails", async () => {
      const outputSink = vi.fn();
      await runPhaserAtlasExport({
        plan: createPhaserAtlasExportPlan({
          area: makeArea(),
          fps: 2,
          scale: 100,
          animations: makeAnimations(),
          trim: true,
          padding: 2,
          maxPageSize: 2048,
          loop: true,
          outputName: "test",
          destination: "zip",
        }),
        captureFrame: vi.fn(successCapture),
        adapter: vi.fn(async () => ({
          ok: false,
          code: "ERR",
          message: "fail",
        })),
        outputSink,
      });

      expect(outputSink).not.toHaveBeenCalled();
    });

    it("returns cancelled when signal aborted before capture", async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await runPhaserAtlasExport({
        plan: createPhaserAtlasExportPlan({
          area: makeArea(),
          fps: 2,
          scale: 100,
          animations: makeAnimations(),
          trim: true,
          padding: 2,
          maxPageSize: 2048,
          loop: true,
          outputName: "test",
          destination: "zip",
        }),
        captureFrame: vi.fn(),
        adapter: makeAdapter(),
        outputSink: vi.fn(),
        signal: controller.signal,
      });

      expect(result.ok).toBe(false);
      expect(result.cancelled).toBe(true);
    });
  });

  describe("empty and transparent frames", () => {
    it("packer handles empty frames as 1x1 regions", () => {
      const result = packAtlasFrames(
        [
          {
            identity: "empty",
            cropX: 0,
            cropY: 0,
            cropW: 1,
            cropH: 1,
            sourceWidth: 64,
            sourceHeight: 64,
            empty: true,
          },
          {
            identity: "visible",
            cropX: 0,
            cropY: 0,
            cropW: 32,
            cropH: 32,
            sourceWidth: 64,
            sourceHeight: 64,
            empty: false,
          },
        ],
        0,
        2048,
      );

      expect("pages" in result).toBe(true);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].regions).toHaveLength(2);
      const emptyRegion = result.pages[0].regions.find(
        (r) => r.name === "empty",
      );
      expect(emptyRegion.frame.w).toBe(1);
      expect(emptyRegion.frame.h).toBe(1);
    });

    it("all-transparent frames still produce valid layout", () => {
      const result = packAtlasFrames(
        [
          {
            identity: "e1",
            cropX: 0,
            cropY: 0,
            cropW: 1,
            cropH: 1,
            sourceWidth: 32,
            sourceHeight: 32,
            empty: true,
          },
          {
            identity: "e2",
            cropX: 0,
            cropY: 0,
            cropW: 1,
            cropH: 1,
            sourceWidth: 32,
            sourceHeight: 32,
            empty: true,
          },
        ],
        0,
        2048,
      );

      expect("pages" in result).toBe(true);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].regions).toHaveLength(2);
    });
  });

  describe("destination policy", () => {
    it("plan normalizes download to zip", () => {
      const plan = createPhaserAtlasExportPlan({
        area: makeArea(),
        fps: 24,
        scale: 100,
        animations: makeAnimations(),
        trim: true,
        padding: 2,
        maxPageSize: 2048,
        loop: true,
        outputName: "test",
        destination: "download",
      });
      expect(plan.destination).toBe("zip");
    });

    it("plan preserves folder destination", () => {
      const plan = createPhaserAtlasExportPlan({
        area: makeArea(),
        fps: 24,
        scale: 100,
        animations: makeAnimations(),
        trim: true,
        padding: 2,
        maxPageSize: 2048,
        loop: true,
        outputName: "test",
        destination: "folder",
      });
      expect(plan.destination).toBe("folder");
    });

    it("plan defaults to zip when destination omitted", () => {
      const plan = createPhaserAtlasExportPlan({
        area: makeArea(),
        fps: 24,
        scale: 100,
        animations: makeAnimations(),
        trim: true,
        padding: 2,
        maxPageSize: 2048,
        loop: true,
        outputName: "test",
      });
      expect(plan.destination).toBe("zip");
    });
  });

  describe("existing raster pipeline regression", () => {
    it("raster export tests still pass (smoke check)", async () => {
      const { resolveExportEncoder } =
        await import("@/features/export/composition/exportInfrastructure");
      expect(() => resolveExportEncoder("png_sequence")).not.toThrow();
      expect(() => resolveExportEncoder("png_spritesheet")).not.toThrow();
      expect(() => resolveExportEncoder("gif")).not.toThrow();
      expect(() => resolveExportEncoder("phaser_atlas")).toThrow();
    });

    it("raster plan creation still works", async () => {
      const { createRasterExportPlan } =
        await import("@/features/export/domain/rasterExportPlan");
      const plan = createRasterExportPlan({
        variantId: "png_sequence",
        area: makeArea(),
        fps: 24,
        scale: 100,
        animations: makeAnimations(),
        background: { enabled: false, color: "#ffffff" },
        spriteSheetColumns: 1,
        outputName: "test",
        destination: "zip",
      });
      expect(plan.variantId).toBe("png_sequence");
    });
  });
});
