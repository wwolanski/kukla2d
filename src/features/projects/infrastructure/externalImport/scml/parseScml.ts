import type {
  ScmlAnimation,
  ScmlDocument,
  ScmlEntity,
  ScmlFileAsset,
  ScmlMainlineKey,
  ScmlRef,
  ScmlTimeline,
  ScmlTransform,
} from "./scmlModel.types.js";

function numberAttr(element: Element, name: string, fallback = 0): number {
  const raw = element.getAttribute(name);
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value))
    throw new Error(`Invalid SCML number: ${element.tagName}.${name}="${raw}"`);
  return value;
}

function intAttr(element: Element, name: string, fallback = 0): number {
  return Math.trunc(numberAttr(element, name, fallback));
}

function directChildren(element: Element, tagName: string): Element[] {
  return Array.from(element.children).filter(
    (child) => child.tagName === tagName,
  );
}

function requiredChild(element: Element, tagNames: readonly string[]): Element {
  const child = Array.from(element.children).find((candidate) =>
    tagNames.includes(candidate.tagName),
  );
  if (!child)
    throw new Error(
      `Invalid SCML: <${element.tagName}> needs <${tagNames.join("> or <")}>`,
    );
  return child;
}

function parseTransform(element: Element): ScmlTransform {
  const transform: ScmlTransform = {
    x: numberAttr(element, "x"),
    y: numberAttr(element, "y"),
    angle: numberAttr(element, "angle"),
    scaleX: numberAttr(element, "scale_x", 1),
    scaleY: numberAttr(element, "scale_y", 1),
    alpha: numberAttr(element, "a", 1),
  };
  if (element.hasAttribute("pivot_x"))
    transform.pivotX = numberAttr(element, "pivot_x");
  if (element.hasAttribute("pivot_y"))
    transform.pivotY = numberAttr(element, "pivot_y");
  if (element.hasAttribute("folder"))
    transform.folderId = intAttr(element, "folder");
  if (element.hasAttribute("file")) transform.fileId = intAttr(element, "file");
  return transform;
}

function parseRef(element: Element): ScmlRef {
  return {
    id: intAttr(element, "id"),
    parentId: element.hasAttribute("parent")
      ? intAttr(element, "parent")
      : null,
    timelineId: intAttr(element, "timeline"),
    keyId: intAttr(element, "key"),
    zIndex: intAttr(element, "z_index"),
  };
}

function parseMainlineKey(element: Element): ScmlMainlineKey {
  return {
    id: intAttr(element, "id"),
    time: numberAttr(element, "time"),
    boneRefs: directChildren(element, "bone_ref").map(parseRef),
    objectRefs: directChildren(element, "object_ref").map(parseRef),
  };
}

function parseTimelineKey(element: Element): ScmlTimeline["keys"][number] {
  return {
    id: intAttr(element, "id"),
    time: numberAttr(element, "time"),
    spin: intAttr(element, "spin", 1),
    curveType: element.getAttribute("curve_type") ?? "linear",
    transform: parseTransform(requiredChild(element, ["bone", "object"])),
  };
}

function parseTimeline(element: Element): ScmlTimeline {
  const keys = directChildren(element, "key")
    .map(parseTimelineKey)
    .sort((a, b) => a.time - b.time);
  if (keys.length === 0)
    throw new Error(
      `Invalid SCML: timeline "${element.getAttribute("name") ?? ""}" has no keys`,
    );
  return {
    id: intAttr(element, "id"),
    objectId: element.hasAttribute("obj") ? intAttr(element, "obj") : null,
    name: element.getAttribute("name") ?? `Timeline ${intAttr(element, "id")}`,
    objectType:
      element.getAttribute("object_type") === "bone" ? "bone" : "sprite",
    keys,
  };
}

function parseAnimation(element: Element): ScmlAnimation {
  const length = Math.max(0, numberAttr(element, "length"));
  const interval = Math.max(1, numberAttr(element, "interval", 1000 / 24));
  const mainline = requiredChild(element, ["mainline"]);
  const mainlineKeys = directChildren(mainline, "key")
    .map(parseMainlineKey)
    .sort((a, b) => a.time - b.time);
  if (mainlineKeys.length === 0)
    throw new Error(
      `Invalid SCML: animation "${element.getAttribute("name") ?? ""}" has no mainline keys`,
    );
  return {
    id: intAttr(element, "id"),
    name: element.getAttribute("name") ?? `Animation ${intAttr(element, "id")}`,
    length,
    interval,
    looping: element.getAttribute("looping") !== "false",
    mainlineKeys,
    timelines: directChildren(element, "timeline").map(parseTimeline),
  };
}

function parseObjectInfo(
  element: Element,
  index: number,
): ScmlEntity["objectInfos"][number] {
  return {
    id: element.hasAttribute("id") ? intAttr(element, "id") : index,
    name: element.getAttribute("name") ?? `Object ${index}`,
    type: element.getAttribute("type") ?? "sprite",
    width: numberAttr(element, "w"),
    height: numberAttr(element, "h"),
  };
}

function parseEntity(element: Element): ScmlEntity {
  return {
    id: intAttr(element, "id"),
    name: element.getAttribute("name") ?? `Entity ${intAttr(element, "id")}`,
    objectInfos: directChildren(element, "obj_info").map(parseObjectInfo),
    animations: directChildren(element, "animation").map(parseAnimation),
  };
}

function parseFile(folderId: number, element: Element): ScmlFileAsset {
  const fileId = intAttr(element, "id");
  return {
    key: `${folderId}:${fileId}`,
    folderId,
    fileId,
    name: element.getAttribute("name") ?? `file-${fileId}.png`,
    width: numberAttr(element, "width"),
    height: numberAttr(element, "height"),
    pivotX: numberAttr(element, "pivot_x"),
    pivotY: numberAttr(element, "pivot_y", 1),
  };
}

export function parseScml(xml: string): ScmlDocument {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parseError = document.querySelector("parsererror");
  if (parseError)
    throw new Error(
      `Invalid SCML XML: ${parseError.textContent?.trim() ?? "parse error"}`,
    );
  const root = document.documentElement;
  if (root.tagName !== "spriter_data")
    throw new Error("Invalid SCML: root element must be <spriter_data>");

  const files = directChildren(root, "folder").flatMap((folder) => {
    const folderId = intAttr(folder, "id");
    return directChildren(folder, "file").map((file) =>
      parseFile(folderId, file),
    );
  });
  const entities = directChildren(root, "entity").map(parseEntity);
  if (files.length === 0)
    throw new Error("Invalid SCML: no image files declared");
  if (entities.length === 0)
    throw new Error("Invalid SCML: no entities declared");
  return { generator: root.getAttribute("generator") ?? "", files, entities };
}
