/**
 * Delaunay triangulation using the `delaunator` library (MIT).
 *
 * Replaces the hand-rolled Bowyer-Watson from the prototype.
 * delaunator is ~3KB, numerically robust, and the de-facto standard.
 */
import Delaunator from "delaunator";

import type { Point2D } from "./contour.types.js";
import type { Triangle } from "./delaunay.types.js";

/**
 * Triangulate a set of 2-D points.
 *
 * @param {Array<[number,number]>} points
 * @returns {Array<[number,number,number]>}  Triangles as vertex-index triplets
 */
export function triangulate(points: readonly Point2D[]): Triangle[] {
  if (points.length < 3) return [];

  // delaunator expects a flat [x0,y0, x1,y1, …] array
  const coords = new Float64Array(points.length * 2);
  for (let i = 0; i < points.length; i++) {
    coords[i * 2] = points[i]![0];
    coords[i * 2 + 1] = points[i]![1];
  }

  const d = new Delaunator(coords);
  const triangles: Triangle[] = [];

  for (let i = 0; i < d.triangles.length; i += 3) {
    triangles.push([d.triangles[i]!, d.triangles[i + 1]!, d.triangles[i + 2]!]);
  }

  return triangles;
}
