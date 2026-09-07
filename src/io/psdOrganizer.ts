/** Compatibility helpers for historical SeeThrough-style PSD layer names. */

export const KNOWN_TAGS = [
  "back hair",
  "front hair",
  "headwear",
  "face",
  "irides",
  "eyebrow",
  "eyewhite",
  "eyelash",
  "eyewear",
  "ears",
  "earwear",
  "nose",
  "mouth",
  "neck",
  "neckwear",
  "topwear",
  "handwear",
  "bottomwear",
  "legwear",
  "footwear",
  "tail",
  "wings",
  "objects",
];

interface HistoricalClipNode {
  id: string;
  name: string;
  type?: string;
  clipToPartId?: string;
}

/** Returns the matched tag for a layer name, or null. */
type HistoricalClipSide = "left" | "right" | "center";

interface HistoricalClipInfo {
  tag: "irides" | "eyewhite";
  side: HistoricalClipSide;
}

interface HistoricalClipBucket {
  eyewhites: HistoricalClipNode[];
  irides: HistoricalClipNode[];
}

export function matchTag(name: string): string | null {
  const lower = name.toLowerCase().trim();
  // Exact match first — prevents 'handwear' from matching 'handwear-l', etc.
  for (const tag of KNOWN_TAGS) {
    if (lower === tag) return tag;
  }
  for (const tag of KNOWN_TAGS) {
    if (
      lower.startsWith(tag + "-") ||
      lower.startsWith(tag + " ") ||
      lower.startsWith(tag + "_")
    )
      return tag;
  }
  return null;
}

function getHistoricalClipSide(name: string): HistoricalClipSide {
  const lower = name.toLowerCase();
  if (
    lower.includes("-l") ||
    lower.includes("_l") ||
    lower.includes(" l") ||
    lower.endsWith(" l")
  ) {
    return "left";
  }
  if (
    lower.includes("-r") ||
    lower.includes("_r") ||
    lower.includes(" r") ||
    lower.endsWith(" r")
  ) {
    return "right";
  }
  return "center";
}

function getHistoricalClipInfo(name: string): HistoricalClipInfo | null {
  const tag = matchTag(name);
  if (tag !== "irides" && tag !== "eyewhite") return null;
  return { tag, side: getHistoricalClipSide(name) };
}

function hasExplicitClipToPartId(node: HistoricalClipNode): boolean {
  return Object.prototype.hasOwnProperty.call(node, "clipToPartId");
}

/**
 * Derive deterministic iris -> eyewhite clipping relations from historical
 * naming. Only unique pairs per side get mapped.
 *
 * @param {Array<{id:string, name:string, type?:string, clipToPartId?:string}>} nodes
 * @returns {Map<string, string>}
 */
export function deriveHistoricalClipToPartId(
  nodes: readonly HistoricalClipNode[],
): Map<string, string> {
  const grouped = new Map<HistoricalClipSide, HistoricalClipBucket>();

  for (const node of nodes) {
    if (node.type && node.type !== "part") continue;
    const info = getHistoricalClipInfo(node.name ?? "");
    if (!info) continue;

    const bucket = grouped.get(info.side) ?? { eyewhites: [], irides: [] };
    if (info.tag === "eyewhite") {
      bucket.eyewhites.push(node);
    } else {
      bucket.irides.push(node);
    }
    grouped.set(info.side, bucket);
  }

  const relations = new Map<string, string>();
  for (const { eyewhites, irides } of grouped.values()) {
    if (eyewhites.length !== 1 || irides.length !== 1) continue;
    const [eyewhite] = eyewhites;
    const [iris] = irides;
    if (!eyewhite || !iris) continue;
    if (hasExplicitClipToPartId(iris)) continue;
    relations.set(iris.id, eyewhite.id);
  }

  return relations;
}

/**
 * Apply historical clipping relations without overwriting an explicit
 * `clipToPartId`.
 *
 * @param {Array<{id:string, name:string, type?:string, clipToPartId?:string}>} nodes
 * @returns {Array}
 */
export function applyHistoricalClipToPartId<T extends HistoricalClipNode>(
  nodes: readonly T[],
): T[] {
  const relations = deriveHistoricalClipToPartId(nodes);
  if (relations.size === 0) return [...nodes];

  return nodes.map((node) => {
    if (!relations.has(node.id) || hasExplicitClipToPartId(node)) return node;
    return { ...node, clipToPartId: relations.get(node.id)! };
  });
}
