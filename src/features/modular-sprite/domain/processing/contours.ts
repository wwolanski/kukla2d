import { normalizedPoint } from '../imageMath.js';

import type { ComponentStats } from './connectedComponents.js';

const MAX_CONTOUR_CANDIDATES = 1024;
const MAX_CONTOUR_POINTS = 256;

interface GridPoint {
  x: number;
  y: number;
}

interface ContourSample extends GridPoint {
  step: number;
}

// Clockwise Moore-neighbour order.  Keeping the traversal on adjacent pixels
// prevents the renderer from connecting unrelated points across a concavity.
const MOORE_NEIGHBOURS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1], [1, 0],
  [1, 1], [0, 1], [-1, 1], [-1, 0],
];

function samePoint(left: GridPoint, right: GridPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function isComponentPixel(labels: Int32Array, id: number, width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height && labels[y * width + x] === id;
}

function isBoundaryPixel(labels: Int32Array, id: number, width: number, height: number, point: GridPoint): boolean {
  if (!isComponentPixel(labels, id, width, height, point.x, point.y)) return false;
  return !isComponentPixel(labels, id, width, height, point.x - 1, point.y)
    || !isComponentPixel(labels, id, width, height, point.x + 1, point.y)
    || !isComponentPixel(labels, id, width, height, point.x, point.y - 1)
    || !isComponentPixel(labels, id, width, height, point.x, point.y + 1);
}

function nextBoundaryPixel(
  labels: Int32Array,
  id: number,
  width: number,
  height: number,
  current: GridPoint,
  backtrack: GridPoint,
): { point: GridPoint; backtrack: GridPoint } | null {
  const backtrackIndex = MOORE_NEIGHBOURS.findIndex(([deltaX, deltaY]) => current.x + deltaX === backtrack.x && current.y + deltaY === backtrack.y);
  const firstDirection = backtrackIndex < 0 ? 0 : (backtrackIndex + 1) % MOORE_NEIGHBOURS.length;
  for (let offset = 0; offset < MOORE_NEIGHBOURS.length; offset += 1) {
    const direction = (firstDirection + offset) % MOORE_NEIGHBOURS.length;
    const [deltaX, deltaY] = MOORE_NEIGHBOURS[direction]!;
    const point = { x: current.x + deltaX, y: current.y + deltaY };
    if (!isComponentPixel(labels, id, width, height, point.x, point.y)) continue;
    const previousDirection = (direction + MOORE_NEIGHBOURS.length - 1) % MOORE_NEIGHBOURS.length;
    const [previousDeltaX, previousDeltaY] = MOORE_NEIGHBOURS[previousDirection]!;
    return {
      point,
      backtrack: { x: current.x + previousDeltaX, y: current.y + previousDeltaY },
    };
  }
  return null;
}

function appendContourSample(samples: ContourSample[], point: GridPoint, step: number): void {
  if (samples.length < MAX_CONTOUR_CANDIDATES) {
    samples.push({ ...point, step });
    return;
  }
  const slot = (Math.imul(step, 0x9e3779b1) >>> 0) % (step + 1);
  if (slot < MAX_CONTOUR_CANDIDATES) samples[slot] = { ...point, step };
}

export function componentContour(
  labels: Int32Array,
  id: number,
  width: number,
  height: number,
  centroid: { x: number; y: number },
  bounds: Pick<ComponentStats, 'minX' | 'minY' | 'maxX' | 'maxY'>,
): ReturnType<typeof normalizedPoint>[] {
  // Retain the argument for callers that already provide the component
  // centroid.  The contour must follow neighbouring boundary pixels rather
  // than using the centroid to establish point order.
  void centroid;
  let start: GridPoint | null = null;
  for (let y = bounds.minY; y <= bounds.maxY && y < height; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX && x < width; x += 1) {
      const candidate = { x, y };
      if (isBoundaryPixel(labels, id, width, height, candidate)) {
        start = candidate;
        break;
      }
    }
    if (start) break;
  }
  if (!start) return [];

  const samples: ContourSample[] = [];
  const initialBacktrack = { x: start.x - 1, y: start.y };
  let current = start;
  let backtrack = initialBacktrack;
  let firstNext: GridPoint | null = null;
  let closed = false;
  const maxSteps = Math.max(8, width * height * 2);

  for (let step = 0; step < maxSteps; step += 1) {
    appendContourSample(samples, current, step);
    const next = nextBoundaryPixel(labels, id, width, height, current, backtrack);
    if (!next) break;
    if (!firstNext) {
      firstNext = next.point;
    } else if (samePoint(current, start) && samePoint(next.point, firstNext)) {
      closed = true;
      break;
    }
    current = next.point;
    backtrack = next.backtrack;
  }

  if (closed && samples.length > 1 && samePoint(samples.at(-1)!, start)) samples.pop();
  samples.sort((left, right) => left.step - right.step);
  const stride = Math.max(1, Math.ceil(samples.length / MAX_CONTOUR_POINTS));
  return samples.filter((_, index) => index % stride === 0).map(point => normalizedPoint(point.x, point.y, width, height));
}
