import type {
  PackError,
  PackInput,
  PackedRegion,
  PackResult,
} from "./phaserAtlasPacker.types.js";

function compareFrames(a: PackInput, b: PackInput, padding: number): number {
  const aPaddedW = a.cropW + padding * 2;
  const bPaddedW = b.cropW + padding * 2;
  const aPaddedH = a.cropH + padding * 2;
  const bPaddedH = b.cropH + padding * 2;

  if (aPaddedH !== bPaddedH) return bPaddedH - aPaddedH;

  const aArea = aPaddedW * aPaddedH;
  const bArea = bPaddedW * bPaddedH;
  if (aArea !== bArea) return bArea - aArea;

  if (aPaddedW !== bPaddedW) return bPaddedW - aPaddedW;

  if (a.identity < b.identity) return -1;
  if (a.identity > b.identity) return 1;
  return 0;
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PageState {
  usedW: number;
  usedH: number;
  freeRects: FreeRect[];
  regions: PackedRegion[];
}

function findBestFit(
  freeRects: FreeRect[],
  paddedW: number,
  paddedH: number,
): { x: number; y: number; index: number } | null {
  let bestX = 0;
  let bestY = 0;
  let bestIndex = -1;
  let bestScore = Infinity;

  for (let i = 0; i < freeRects.length; i++) {
    const rect = freeRects[i]!;
    if (paddedW <= rect.w && paddedH <= rect.h) {
      const score = rect.y * 1_000_000 + rect.x;
      if (score < bestScore) {
        bestScore = score;
        bestX = rect.x;
        bestY = rect.y;
        bestIndex = i;
      }
    }
  }

  if (bestIndex < 0) return null;
  return { x: bestX, y: bestY, index: bestIndex };
}

function splitFreeRects(
  freeRects: FreeRect[],
  placedX: number,
  placedY: number,
  placedW: number,
  placedH: number,
): FreeRect[] {
  const result: FreeRect[] = [];

  for (const rect of freeRects) {
    const rectRight = rect.x + rect.w;
    const rectBottom = rect.y + rect.h;
    const placedRight = placedX + placedW;
    const placedBottom = placedY + placedH;

    if (
      placedRight <= rect.x ||
      placedX >= rectRight ||
      placedBottom <= rect.y ||
      placedY >= rectBottom
    ) {
      result.push(rect);
      continue;
    }

    if (placedX > rect.x) {
      result.push({
        x: rect.x,
        y: rect.y,
        w: placedX - rect.x,
        h: rect.h,
      });
    }
    if (placedRight < rectRight) {
      result.push({
        x: placedRight,
        y: rect.y,
        w: rectRight - placedRight,
        h: rect.h,
      });
    }
    if (placedY > rect.y) {
      result.push({
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: placedY - rect.y,
      });
    }
    if (placedBottom < rectBottom) {
      result.push({
        x: rect.x,
        y: placedBottom,
        w: rect.w,
        h: rectBottom - placedBottom,
      });
    }
  }

  return result;
}

function tryPlaceOnPage(
  page: PageState,
  frame: PackInput,
  padding: number,
  maxPageSize: number,
): { x: number; y: number } | null {
  const paddedW = frame.cropW + padding * 2;
  const paddedH = frame.cropH + padding * 2;

  const fit = findBestFit(page.freeRects, paddedW, paddedH);
  if (fit) {
    return { x: fit.x, y: fit.y };
  }

  const expandRight = page.usedW + paddedW;
  const expandDown = page.usedH + paddedH;

  if (expandRight <= maxPageSize && expandDown <= maxPageSize) {
    if (expandRight <= expandDown) {
      const canExpandRight = page.usedH === 0 || expandRight <= maxPageSize;
      if (canExpandRight) {
        return { x: page.usedW, y: 0 };
      }
    } else {
      const canExpandDown = page.usedW === 0 || expandDown <= maxPageSize;
      if (canExpandDown) {
        return { x: 0, y: page.usedH };
      }
    }
  } else if (expandRight <= maxPageSize) {
    return { x: page.usedW, y: 0 };
  } else if (expandDown <= maxPageSize) {
    return { x: 0, y: page.usedH };
  }

  return null;
}

export function packAtlasFrames(
  frames: readonly PackInput[],
  padding: number,
  maxPageSize: number,
): PackResult | PackError {
  if (!Number.isInteger(padding) || padding < 0 || padding > 32) {
    throw new Error(`padding must be integer 0..32, got ${padding}`);
  }
  if (!Number.isInteger(maxPageSize) || maxPageSize <= 0) {
    throw new Error(
      `maxPageSize must be a positive integer, got ${maxPageSize}`,
    );
  }

  const seen = new Set<string>();
  for (const frame of frames) {
    if (seen.has(frame.identity)) {
      return {
        code: "PHASER_ATLAS_DUPLICATE_KEY",
        frameKey: frame.identity,
        requiredSize: 0,
        selectedSize: 0,
        message: `Duplicate frame identity: ${frame.identity}`,
      };
    }
    seen.add(frame.identity);
  }

  for (const frame of frames) {
    const paddedW = frame.cropW + padding * 2;
    const paddedH = frame.cropH + padding * 2;
    if (paddedW > maxPageSize || paddedH > maxPageSize) {
      return {
        code: "PHASER_ATLAS_OVERSIZED_FRAME",
        frameKey: frame.identity,
        requiredSize: Math.max(paddedW, paddedH),
        selectedSize: maxPageSize,
        message: `Frame ${frame.identity} padded size ${paddedW}×${paddedH} exceeds max page ${maxPageSize}`,
      };
    }
  }

  const sorted = [...frames].sort((a, b) => compareFrames(a, b, padding));

  const pageStates: PageState[] = [];

  for (const frame of sorted) {
    const paddedW = frame.cropW + padding * 2;
    const paddedH = frame.cropH + padding * 2;

    let placed = false;
    for (let pi = 0; pi < pageStates.length; pi++) {
      const page = pageStates[pi]!;
      const pos = tryPlaceOnPage(page, frame, padding, maxPageSize);
      if (pos) {
        const region = buildRegion(frame, pos.x, pos.y, padding, pi);
        page.regions.push(region);
        page.freeRects = splitFreeRects(
          page.freeRects,
          pos.x,
          pos.y,
          paddedW,
          paddedH,
        );
        page.usedW = Math.max(page.usedW, pos.x + paddedW);
        page.usedH = Math.max(page.usedH, pos.y + paddedH);
        placed = true;
        break;
      }
    }

    if (!placed) {
      const newPage: PageState = {
        usedW: paddedW,
        usedH: paddedH,
        freeRects: [],
        regions: [],
      };
      const pageIndex = pageStates.length;
      const region = buildRegion(frame, 0, 0, padding, pageIndex);
      newPage.regions.push(region);
      newPage.freeRects = splitFreeRects([], 0, 0, paddedW, paddedH);
      pageStates.push(newPage);
    }
  }

  const pages = pageStates.map((state) => ({
    width: state.usedW,
    height: state.usedH,
    regions: Object.freeze(state.regions),
  }));

  return { pages: Object.freeze(pages) };
}

function buildRegion(
  frame: PackInput,
  x: number,
  y: number,
  padding: number,
  pageIndex: number,
): PackedRegion {
  return {
    name: frame.identity,
    frame: {
      x: x + padding,
      y: y + padding,
      w: frame.cropW,
      h: frame.cropH,
    },
    rotated: false,
    trimmed:
      frame.empty ||
      frame.cropW !== frame.sourceWidth ||
      frame.cropH !== frame.sourceHeight ||
      frame.cropX !== 0 ||
      frame.cropY !== 0,
    spriteSourceSize: {
      x: frame.cropX,
      y: frame.cropY,
      w: frame.cropW,
      h: frame.cropH,
    },
    sourceSize: {
      w: frame.sourceWidth,
      h: frame.sourceHeight,
    },
    pageIndex,
  };
}

export function validatePackLayout(
  frames: readonly PackInput[],
  result: PackResult,
  padding: number,
): string[] {
  const errors: string[] = [];

  if (result.pages.length === 0 && frames.length > 0) {
    errors.push("Expected at least one page for non-empty frames");
    return errors;
  }

  const allRegionNames = new Set<string>();
  let totalRegions = 0;

  for (let pi = 0; pi < result.pages.length; pi++) {
    const page = result.pages[pi]!;
    for (const region of page.regions) {
      totalRegions++;
      if (allRegionNames.has(region.name)) {
        errors.push(`Duplicate region name: ${region.name}`);
      }
      allRegionNames.add(region.name);

      const fx = region.frame.x;
      const fy = region.frame.y;
      const fw = region.frame.w;
      const fh = region.frame.h;

      if (fw <= 0 || fh <= 0) {
        errors.push(
          `Region ${region.name} has non-positive frame size: ${fw}×${fh}`,
        );
      }
      if (fx < 0 || fy < 0) {
        errors.push(
          `Region ${region.name} has negative position: (${fx}, ${fy})`,
        );
      }
      if (fx + fw + padding > page.width || fy + fh + padding > page.height) {
        errors.push(`Region ${region.name} padded bounds exceed page size`);
      }

      if (region.pageIndex !== pi) {
        errors.push(
          `Region ${region.name} pageIndex ${region.pageIndex} does not match actual page ${pi}`,
        );
      }
    }

    for (let i = 0; i < page.regions.length; i++) {
      for (let j = i + 1; j < page.regions.length; j++) {
        const a = page.regions[i]!;
        const b = page.regions[j]!;
        const aLeft = a.frame.x - padding;
        const aTop = a.frame.y - padding;
        const aRight = a.frame.x + a.frame.w + padding;
        const aBottom = a.frame.y + a.frame.h + padding;
        const bLeft = b.frame.x - padding;
        const bTop = b.frame.y - padding;
        const bRight = b.frame.x + b.frame.w + padding;
        const bBottom = b.frame.y + b.frame.h + padding;

        if (
          aLeft < bRight &&
          aRight > bLeft &&
          aTop < bBottom &&
          aBottom > bTop
        ) {
          errors.push(`Overlap between ${a.name} and ${b.name} on page ${pi}`);
        }
      }
    }
  }

  if (totalRegions !== frames.length) {
    errors.push(`Expected ${frames.length} regions, found ${totalRegions}`);
  }

  for (const frame of frames) {
    if (!allRegionNames.has(frame.identity)) {
      errors.push(`Missing region for frame: ${frame.identity}`);
    }
  }

  return errors;
}
