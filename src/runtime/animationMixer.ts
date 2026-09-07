import type { Animation, AnimationId } from "@kukla2d/contracts";

import {
  interpolateMeshVerts,
  interpolateTrack,
} from "../domain/animationEngine.js";

import type {
  AnimationLayer,
  RuntimeAnimationEvent,
} from "./animationMixer.types.js";
import type { PoseOverrides } from "../domain/animationEngine.types.js";

interface LayerEvaluationResult {
  overrides: PoseOverrides;
  events: readonly RuntimeAnimationEvent[];
  diagnostics: readonly LayerDiagnostic[];
}

type LayerDiagnostic =
  | { code: "CLIP_NOT_FOUND"; clipId: AnimationId }
  | { code: "INVALID_DELTA"; value: number }
  | { code: "INVALID_EVENT"; clipId: AnimationId; time: number };

export function evaluateLayers(
  layers: readonly AnimationLayer[],
  clips: readonly Animation[],
  deltaSeconds: number,
): LayerEvaluationResult {
  const overrides: PoseOverrides = new Map();
  const events: RuntimeAnimationEvent[] = [];
  const diagnostics: LayerDiagnostic[] = [];
  const safeDelta = Number.isFinite(deltaSeconds) ? deltaSeconds : 0;
  if (safeDelta !== deltaSeconds)
    diagnostics.push({ code: "INVALID_DELTA", value: deltaSeconds });

  for (const layer of [...layers].sort(
    (left, right) => left.order - right.order,
  )) {
    if (layer.weight <= 0 || !layer.clipId) continue;
    const clip = clips.find((candidate) => candidate.id === layer.clipId);
    if (!clip) {
      diagnostics.push({ code: "CLIP_NOT_FOUND", clipId: layer.clipId });
      continue;
    }
    const previousTime = layer.time;
    layer.time += safeDelta * layer.timeScale;
    const durationSeconds = Math.max(0, clip.duration / 1000);
    if (layer.loop && durationSeconds > 0) {
      layer.time = positiveModulo(layer.time, durationSeconds);
    } else {
      layer.time = Math.max(0, Math.min(durationSeconds, layer.time));
    }
    const clipOverrides = evaluateClip(clip, layer);
    mergeLayer(overrides, clipOverrides, layer);
    collectEvents(events, diagnostics, clip, layer, previousTime);
  }
  return { overrides, events, diagnostics };
}

function evaluateClip(clip: Animation, layer: AnimationLayer): PoseOverrides {
  const overrides: PoseOverrides = new Map();
  const timeMs = layer.time * 1000;
  for (const track of clip.tracks) {
    if (
      track.property === "event" ||
      (layer.maskBoneIds && !layer.maskBoneIds.has(track.targetId))
    )
      continue;
    const value =
      track.property === "mesh_verts"
        ? interpolateMeshVerts(track.keyframes, timeMs)
        : interpolateTrack(track.keyframes, timeMs);
    if (value === undefined) continue;
    const target = overrides.get(track.targetId) ?? {};
    target[track.property] = value;
    overrides.set(track.targetId, target);
  }
  return overrides;
}

function mergeLayer(
  target: PoseOverrides,
  source: PoseOverrides,
  layer: AnimationLayer,
): void {
  for (const [targetId, properties] of source) {
    const output = target.get(targetId) ?? {};
    for (const [property, value] of Object.entries(properties)) {
      if (layer.mode === "additive") {
        if (typeof value === "number")
          output[property] =
            numericOrZero(output[property]) + value * layer.weight;
      } else if (typeof value === "number") {
        const base = numericOrZero(output[property]);
        output[property] = base + (value - base) * layer.weight;
      } else if (layer.weight > 0.5 || output[property] === undefined) {
        output[property] = value;
      }
    }
    target.set(targetId, output);
  }
}

function collectEvents(
  events: RuntimeAnimationEvent[],
  diagnostics: LayerDiagnostic[],
  clip: Animation,
  layer: AnimationLayer,
  previousTime: number,
): void {
  for (const track of clip.tracks) {
    if (track.property !== "event") continue;
    for (const keyframe of track.keyframes) {
      const time = keyframe.time / 1000;
      if (!(previousTime < time && layer.time >= time)) continue;
      const eventId = readEventId(keyframe.value);
      if (!eventId)
        diagnostics.push({ code: "INVALID_EVENT", clipId: clip.id, time });
      else
        events.push({
          eventId,
          layerOrder: layer.order,
          clipId: clip.id,
          time,
        });
    }
  }
}

function readEventId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || !("eventId" in value))
    return null;
  return typeof value.eventId === "string" ? value.eventId : null;
}
function numericOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
