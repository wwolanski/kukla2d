import type { ProjectDocument } from "@kukla2d/contracts";

export const MAX_NAME_LENGTH = 256;

function takeCharacters(value: string, length: number): string {
  return Array.from(value).slice(0, length).join("");
}

function characterLength(value: string): number {
  return Array.from(value).length;
}

export function limitName(value: unknown): string {
  return typeof value === "string"
    ? takeCharacters(value, MAX_NAME_LENGTH)
    : "";
}

export function limitFileName(value: unknown): string {
  if (typeof value !== "string") return "";
  if (characterLength(value) <= MAX_NAME_LENGTH) return value;

  const extensionStart = value.lastIndexOf(".");
  const extension = extensionStart > 0 ? value.slice(extensionStart) : "";
  const extensionLength = characterLength(extension);
  if (!extension || extensionLength >= MAX_NAME_LENGTH)
    return takeCharacters(value, MAX_NAME_LENGTH);

  return `${takeCharacters(value.slice(0, extensionStart), MAX_NAME_LENGTH - extensionLength)}${extension}`;
}

export function truncateDisplayName(
  value: unknown,
  maxLength = MAX_NAME_LENGTH,
): string {
  if (typeof value !== "string") return "";
  const characters = Array.from(value);
  if (characters.length <= maxLength) return value;
  if (maxLength <= 3) return ".".repeat(Math.max(0, maxLength));
  return `${characters.slice(0, maxLength - 3).join("")}...`;
}

export function normalizeProjectNames(project: ProjectDocument): void {
  if (typeof project.author === "string") project.author = limitName(project.author);
  if (project.canvas?.fitSource?.kind === "animation")
    project.canvas.fitSource.animationName = limitName(
      project.canvas.fitSource.animationName,
    );

  for (const texture of project.textures ?? []) {
    if (texture.name !== undefined) texture.name = limitName(texture.name);
    if (texture.fileName !== undefined)
      texture.fileName = limitFileName(texture.fileName);
  }
  for (const node of project.nodes ?? []) {
    node.name = limitName(node.name);
    if (node.type === "part")
      for (const blendShape of node.blendShapes ?? [])
        blendShape.name = limitName(blendShape.name);
  }
  for (const bone of project.bones ?? []) bone.name = limitName(bone.name);
  for (const slot of project.slots ?? []) slot.name = limitName(slot.name);
  for (const skin of project.skins ?? []) skin.name = limitName(skin.name);
  for (const constraint of project.constraints ?? [])
    constraint.name = limitName(constraint.name);
  for (const animation of project.animations ?? []) {
    animation.name = limitName(animation.name);
    for (const marker of animation.markers ?? [])
      marker.label = limitName(marker.label);
    for (const audioTrack of animation.audioTracks ?? [])
      if (audioTrack.name !== undefined)
        audioTrack.name = limitName(audioTrack.name);
  }
  for (const folder of project.libraryFolders ?? []) {
    folder.name = limitName(folder.name);
    if (folder.sourceFileName !== undefined)
      folder.sourceFileName = limitFileName(folder.sourceFileName);
  }
  for (const modularSprite of project.modularSprites ?? []) {
    modularSprite.name = limitName(modularSprite.name);
    for (const part of modularSprite.parts) part.name = limitName(part.name);
    const snapshot = modularSprite.schemaBinding?.snapshot;
    if (snapshot) snapshot.name = limitName(snapshot.name);
  }
  for (const handle of project.controlHandles ?? [])
    handle.name = limitName(handle.name);
  for (const modifier of project.animationModifiers ?? [])
    modifier.name = limitName(modifier.name);
  for (const rule of project.physicsRules ?? []) {
    if (typeof rule.name === "string") rule.name = limitName(rule.name);
  }
}
