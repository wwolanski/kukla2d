import { describe, expect, it } from "vitest";

import {
  MAX_NAME_LENGTH,
  limitFileName,
  limitName,
  normalizeProjectNames,
  truncateDisplayName,
} from "@/domain/nameConstraints.js";
import { createEmptyProject } from "@/core/createEmptyProject.js";

describe("name constraints", () => {
  it("limits names by Unicode characters without splitting surrogate pairs", () => {
    const value = "😀".repeat(MAX_NAME_LENGTH + 20);

    const result = limitName(value);

    expect(Array.from(result)).toHaveLength(MAX_NAME_LENGTH);
    expect(result).toBe("😀".repeat(MAX_NAME_LENGTH));
  });

  it("keeps a file extension while applying the hard limit", () => {
    const result = limitFileName(`${"a".repeat(MAX_NAME_LENGTH + 20)}.png`);

    expect(Array.from(result)).toHaveLength(MAX_NAME_LENGTH);
    expect(result.endsWith(".png")).toBe(true);
  });

  it("adds an explicit ellipsis for overlong display values", () => {
    expect(truncateDisplayName("1234567890", 8)).toBe("12345...");
  });

  it("normalizes every persisted panel name at the project boundary", () => {
    const project = createEmptyProject();
    const longName = "x".repeat(MAX_NAME_LENGTH + 1);
    project.nodes.push({
      id: "node-1" as never,
      type: "group",
      name: longName,
      parent: null,
      opacity: 1,
      visible: true,
      transform: {
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        pivotX: 0,
        pivotY: 0,
      },
    });
    project.bones.push({
      id: "bone-1" as never,
      name: longName,
      parentId: null,
      setup: {
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        shearX: 0,
        shearY: 0,
        length: 40,
      },
    });
    project.libraryFolders.push({ id: "folder-1", name: longName });

    normalizeProjectNames(project);

    expect(project.nodes[0].name).toHaveLength(MAX_NAME_LENGTH);
    expect(project.bones[0].name).toHaveLength(MAX_NAME_LENGTH);
    expect(project.libraryFolders[0].name).toHaveLength(MAX_NAME_LENGTH);
  });
});
