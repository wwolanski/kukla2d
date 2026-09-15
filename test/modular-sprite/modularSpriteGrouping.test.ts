import { describe, expect, it } from "vitest";

import { partKeyForName } from "@/features/modular-sprite/application/partDraftFactory";
import {
  createInitialGrouping,
  createPartFromRegions,
  excludeRegions,
  moveRegionsToPart,
  reconcileGrouping,
  removePart,
  renamePart,
  validateGrouping,
} from "@/features/modular-sprite/domain/partGrouping";
import {
  mapRegions,
  reconcilePreviewToFullResolution,
} from "@/features/modular-sprite/domain/regionReconciliation";

import type {
  DetectedRegion,
  ModularSpriteDraftPart,
} from "@/features/modular-sprite/domain/contracts.types";

function region(
  id: number,
  x: number,
  y: number,
  width = 0.2,
  height = 0.2,
): DetectedRegion {
  return {
    id,
    area: Math.round(width * height * 10000),
    bounds: {
      x: Math.round(x * 100),
      y: Math.round(y * 100),
      width: Math.round(width * 100),
      height: Math.round(height * 100),
    },
    normalizedBounds: { x, y, width, height },
    centroid: { x: x + width / 2, y: y + height / 2 },
    suggestedRole: "custom",
    contour: [],
  };
}

function partFactory(
  next: DetectedRegion,
  index: number,
  existing: readonly ModularSpriteDraftPart[],
): ModularSpriteDraftPart {
  const partKey = `part-${index + 1}-${existing.length}`;
  return {
    partKey,
    name: partKey,
    role: "custom",
    side: "none",
    required: true,
    order: index,
    extractionFrame: next.normalizedBounds,
    contentBounds: next.normalizedBounds,
    regionIds: [next.id],
  };
}

function partWithKey(partKey: string): ModularSpriteDraftPart {
  return {
    partKey,
    name: partKey,
    role: "custom",
    side: "none",
    required: true,
    order: 0,
    extractionFrame: { x: 0, y: 0, width: 1, height: 1 },
    contentBounds: { x: 0, y: 0, width: 1, height: 1 },
    regionIds: [],
  };
}

describe("modular sprite region grouping", () => {
  const regions = [
    region(1, 0.1, 0.1),
    region(2, 0.6, 0.1),
    region(3, 0.4, 0.6),
  ];

  it("rejects stable keys that differ only by letter case", () => {
    const validation = validateGrouping(
      {
        parts: [
          { ...partWithKey("head"), regionIds: [1] },
          { ...partWithKey("HEAD"), regionIds: [2] },
        ],
        excludedRegionIds: [3],
      },
      [1, 2, 3],
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("Duplicate partKey: HEAD");
  });

  it("creates a complete initial grouping and tracks deliberate exclusions", () => {
    const grouping = createInitialGrouping(regions, partFactory);
    expect(validateGrouping(grouping, [1, 2, 3]).valid).toBe(true);

    const excluded = excludeRegions(grouping, [2]).grouping;
    expect(excluded.excludedRegionIds).toEqual([2]);
    expect(excluded.parts.flatMap((part) => part.regionIds)).toEqual([1, 3]);
    expect(validateGrouping(excluded, [1, 2, 3]).valid).toBe(true);
  });

  it("moves selected regions without leaving duplicate assignments", () => {
    const grouping = createInitialGrouping(regions, partFactory);
    const targetKey = grouping.parts[0]!.partKey;
    const moved = moveRegionsToPart(grouping, [2, 3], targetKey).grouping;
    expect(moved.parts).toHaveLength(1);
    expect(moved.parts[0]!.regionIds).toEqual([1, 2, 3]);
    expect(validateGrouping(moved, [1, 2, 3]).valid).toBe(true);
  });

  it("keeps an explicitly created empty part when regions are dropped into it", () => {
    const grouping = createInitialGrouping(regions, partFactory);
    const emptyPart: ModularSpriteDraftPart = {
      ...grouping.parts[0]!,
      partKey: "empty-part",
      name: "Empty part",
      contentBounds: { x: 0, y: 0, width: 0, height: 0 },
      regionIds: [],
    };
    const moved = moveRegionsToPart(
      {
        parts: [...grouping.parts, emptyPart],
        excludedRegionIds: [],
      },
      [1],
      emptyPart.partKey,
      { regions, dimensions: { width: 100, height: 100 } },
    ).grouping;
    const target = moved.parts.find(
      (part) => part.partKey === emptyPart.partKey,
    );
    expect(target?.regionIds).toEqual([1]);
    expect(target?.contentBounds).toEqual(regions[0]!.normalizedBounds);
    expect(validateGrouping(moved, [1, 2, 3]).valid).toBe(true);
  });

  it("creates, renames, removes and reconciles parts as pure operations", () => {
    const grouping = createInitialGrouping(regions, partFactory);
    const created = createPartFromRegions(
      grouping,
      regions,
      [1, 2],
      partFactory,
      { width: 100, height: 100 },
    ).grouping;
    expect(created.parts).toHaveLength(2);
    const createdPart = created.parts.at(-1)!;
    const renamed = renamePart(created, createdPart.partKey, "Merged").grouping;
    expect(renamed.parts.at(-1)?.name).toBe("Merged");
    const removed = removePart(renamed, createdPart.partKey).grouping;
    expect(removed.excludedRegionIds).toContain(1);
    expect(removed.excludedRegionIds).toContain(2);

    const reconciled = reconcileGrouping(
      createInitialGrouping(regions, partFactory),
      new Map([
        [1, [11, 12]],
        [2, [13]],
        [3, []],
      ]),
      [11, 12, 13, 14],
    );
    expect(reconciled.parts.flatMap((part) => part.regionIds)).toEqual([
      11, 12, 13,
    ]);
    expect(reconciled.excludedRegionIds).toEqual([14]);
    expect(validateGrouping(reconciled, [11, 12, 13, 14]).valid).toBe(true);
  });
});

describe("modular sprite region reconciliation", () => {
  it("maps split regions to one part and reports missing/uncertain matches", () => {
    const previous = [region(1, 0.2, 0.2, 0.4, 0.4), region(2, 0.7, 0.7)];
    const next = [
      region(11, 0.2, 0.2, 0.2, 0.4),
      region(12, 0.4, 0.2, 0.2, 0.4),
      region(13, 0.7, 0.7),
    ];
    const report = mapRegions(previous, next);
    expect(
      report.mappings.find((item) => item.previousRegionId === 1)
        ?.nextRegionIds,
    ).toEqual([11, 12]);
    expect(
      report.mappings.find((item) => item.previousRegionId === 2)
        ?.nextRegionIds,
    ).toEqual([13]);
    expect(report.lostPreviousRegionIds).toEqual([]);
    expect(report.uncertainPreviousRegionIds).toContain(1);
  });

  it("reconciles preview and full-resolution IDs without greedy part-order effects", () => {
    const grouping = createInitialGrouping(
      [region(1, 0.1, 0.1), region(2, 0.6, 0.1)],
      partFactory,
    );
    const result = reconcilePreviewToFullResolution(
      grouping,
      [region(1, 0.1, 0.1), region(2, 0.6, 0.1)],
      [region(101, 0.1, 0.1), region(102, 0.6, 0.1)],
    );
    expect(result.grouping.parts.map((part) => part.regionIds)).toEqual([
      [101],
      [102],
    ]);
    expect(result.report.unmatchedNextRegionIds).toEqual([]);
  });
});

describe("partKeyForName", () => {
  it("creates a slug for a regular name", () => {
    expect(partKeyForName("Left Arm", [])).toBe("left-arm");
  });

  it("adds deterministic suffixes for duplicate keys", () => {
    expect(
      partKeyForName("Head", [partWithKey("head"), partWithKey("head-2")]),
    ).toBe("head-3");
  });

  it("treats keys that differ only by case as duplicates", () => {
    expect(partKeyForName("Head", [partWithKey("HEAD")])).toBe("head-2");
  });

  it("handles diacritics and punctuation that collapse to the same slug", () => {
    expect(partKeyForName("Éclair!", [partWithKey("eclair")])).toBe("eclair-2");
  });

  it("ignores the current part when checking collisions", () => {
    expect(partKeyForName("Head", [partWithKey("head")], "HEAD")).toBe("head");
  });
});
