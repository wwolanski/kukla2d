import {
  toAnimationTargetId,
  type AnimationTargetId,
  type Track,
} from "@kukla2d/contracts";

import type { KeyframeAddress } from "./keyframeAddress.types.js";

export function createKeyframeAddress(
  targetId: AnimationTargetId,
  property: string,
  timeMs: number,
): KeyframeAddress {
  return { targetId: toAnimationTargetId(targetId), property, timeMs };
}

export function parseKeyframeAddress(address: string): KeyframeAddress | null {
  const match = address.match(/^([^:]+):(.+):([^:]+)$/);
  if (!match) return null;
  const targetId = match[1];
  const property = match[2];
  if (targetId === undefined || property === undefined) return null;
  const timeMs = Number(match[3]);
  if (!Number.isFinite(timeMs)) return null;
  return { targetId: toAnimationTargetId(targetId), property, timeMs };
}

export function keyframeAddressToString({
  targetId,
  property,
  timeMs,
}: KeyframeAddress): string {
  return `${targetId}:${property}:${timeMs}`;
}

export function compareKeyframeAddresses(
  a: KeyframeAddress,
  b: KeyframeAddress,
): number {
  if (a.targetId < b.targetId) return -1;
  if (a.targetId > b.targetId) return 1;
  if (a.property < b.property) return -1;
  if (a.property > b.property) return 1;
  if (a.timeMs < b.timeMs) return -1;
  if (a.timeMs > b.timeMs) return 1;
  return 0;
}

export function collectTrackKeyframeAddresses(
  tracks: readonly Track[] | null | undefined,
  timeMs: number,
): KeyframeAddress[] {
  return (tracks ?? [])
    .filter(
      (track) =>
        track?.targetId &&
        track?.property &&
        track.keyframes?.some((keyframe) => keyframe.time === timeMs),
    )
    .map((track) =>
      createKeyframeAddress(track.targetId, track.property, timeMs),
    );
}

export function parseKeyframeAddressSet(
  addresses: Iterable<string> | null | undefined,
): KeyframeAddress[] {
  return Array.from(addresses ?? [])
    .map((address) => parseKeyframeAddress(address))
    .filter((address): address is KeyframeAddress => address !== null);
}
