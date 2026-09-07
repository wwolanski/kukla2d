import type { MigrationDocument } from "./migrationDocument.types.js";

export const FROM_VERSION = 4 as const;
export const TO_VERSION = 5 as const;

interface MigrationTrack {
  nodeId?: string | null | undefined;
  targetId?: string | null | undefined;
  property?: string | undefined;
  keyframes?: unknown[];
  [key: string]: unknown;
}

function trackLocation(animationIndex: number, trackIndex: number): string {
  return `animations[${animationIndex}].tracks[${trackIndex}]`;
}

export function migrate_4_to_5(project: MigrationDocument): MigrationDocument {
  const animations = Array.isArray(project.animations)
    ? project.animations
    : [];
  return {
    ...project,
    version: 5,
    animations: animations.map((animation, animationIndex) => ({
      ...animation,
      tracks: (Array.isArray(animation.tracks) ? animation.tracks : []).map(
        (track, trackIndex) => {
          return normalizeTrack(track, animationIndex, trackIndex);
        },
      ),
    })),
  };
}

function normalizeTrack(
  track: MigrationTrack,
  animationIndex: number,
  trackIndex: number,
): MigrationTrack {
  const hasNodeId = track.nodeId !== undefined && track.nodeId !== null;
  const hasTargetId = track.targetId !== undefined && track.targetId !== null;

  if (hasNodeId && hasTargetId && track.nodeId !== track.targetId) {
    throw new Error(
      `Migration 4->5 conflict at ${trackLocation(animationIndex, trackIndex)}: ` +
        `nodeId "${track.nodeId}" does not match targetId "${track.targetId}"`,
    );
  }

  if (!hasNodeId && !hasTargetId) {
    throw new Error(
      `Migration 4->5 missing target id at ${trackLocation(animationIndex, trackIndex)}`,
    );
  }

  const targetId = hasTargetId ? track.targetId : track.nodeId;
  const nextTrack: MigrationTrack = { ...track, targetId };
  delete nextTrack.nodeId;
  return nextTrack;
}
