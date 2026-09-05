const NEIGHBORS_8 = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;

export const MAX_DETECTED_REGIONS = 256;

export interface ComponentStats {
  id: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  sumX: number;
  sumY: number;
}

function hasLowerRetentionPriority(left: ComponentStats, right: ComponentStats): boolean {
  if (left.area !== right.area) return left.area < right.area;
  if (left.minY !== right.minY) return left.minY > right.minY;
  return left.minX > right.minX;
}

function retainLargestComponent(heap: ComponentStats[], component: ComponentStats): void {
  if (heap.length < MAX_DETECTED_REGIONS) {
    heap.push(component);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!hasLowerRetentionPriority(heap[index]!, heap[parent]!)) break;
      [heap[index], heap[parent]] = [heap[parent]!, heap[index]!];
      index = parent;
    }
    return;
  }
  if (!hasLowerRetentionPriority(heap[0]!, component)) return;
  heap[0] = component;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    let lowest = left;
    if (right < heap.length && hasLowerRetentionPriority(heap[right]!, heap[left]!)) lowest = right;
    if (!hasLowerRetentionPriority(heap[lowest]!, heap[index]!)) break;
    [heap[index], heap[lowest]] = [heap[lowest]!, heap[index]!];
    index = lowest;
  }
}

export function connectedComponents(mask: Uint8Array, width: number, height: number, minimumArea: number): {
  labels: Int32Array;
  stats: ComponentStats[];
  discardedRegionCount: number;
} {
  const temporaryLabels = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components: ComponentStats[] = [];
  let validRegionCount = 0;
  let nextLabel = 1;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || temporaryLabels[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    temporaryLabels[start] = nextLabel;
    const stats: ComponentStats = { id: nextLabel, area: 0, minX: width, minY: height, maxX: 0, maxY: 0, sumX: 0, sumY: 0 };
    while (head < tail) {
      const pixelIndex = queue[head++] ?? 0;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      stats.area += 1;
      stats.minX = Math.min(stats.minX, x);
      stats.minY = Math.min(stats.minY, y);
      stats.maxX = Math.max(stats.maxX, x);
      stats.maxY = Math.max(stats.maxY, y);
      stats.sumX += x;
      stats.sumY += y;
      for (const [deltaX, deltaY] of NEIGHBORS_8) {
        const neighborX = x + deltaX;
        const neighborY = y + deltaY;
        if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) continue;
        const neighborIndex = neighborY * width + neighborX;
        if (!mask[neighborIndex] || temporaryLabels[neighborIndex]) continue;
        temporaryLabels[neighborIndex] = nextLabel;
        queue[tail++] = neighborIndex;
      }
    }
    if (stats.area >= minimumArea) {
      validRegionCount += 1;
      retainLargestComponent(components, stats);
    }
    nextLabel += 1;
  }

  const discardedRegionCount = Math.max(0, validRegionCount - components.length);
  const valid = components.sort((left, right) => left.minY - right.minY || left.minX - right.minX || right.area - left.area);
  const remap = new Int32Array(nextLabel);
  valid.forEach((component, index) => { remap[component.id] = index + 1; });
  const labels = new Int32Array(mask.length);
  for (let index = 0; index < labels.length; index += 1) labels[index] = remap[temporaryLabels[index] ?? 0] ?? 0;
  return { labels, stats: valid.map((component, index) => ({ ...component, id: index + 1 })), discardedRegionCount };
}

export function restoreSplitPixels(labels: Int32Array, beforeSplit: Uint8Array, width: number, height: number): void {
  const queue = new Int32Array(labels.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < labels.length; index += 1) if (labels[index]) queue[tail++] = index;
  while (head < tail) {
    const pixelIndex = queue[head++] ?? 0;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const label = labels[pixelIndex] ?? 0;
    for (const [deltaX, deltaY] of NEIGHBORS_8) {
      const neighborX = x + deltaX;
      const neighborY = y + deltaY;
      if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) continue;
      const neighborIndex = neighborY * width + neighborX;
      if (!beforeSplit[neighborIndex] || labels[neighborIndex]) continue;
      labels[neighborIndex] = label;
      queue[tail++] = neighborIndex;
    }
  }
}

