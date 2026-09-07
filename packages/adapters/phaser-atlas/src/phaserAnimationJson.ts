import type {
  AnimationInput,
  AnimationJson,
  AnimationJsonEntry,
  AnimationJsonFrame,
  MarkerEntry,
  MarkerManifest,
} from "./phaserAnimationJson.types.js";

export function buildAnimationJson(
  animations: readonly AnimationInput[],
): AnimationJson {
  const anims: AnimationJsonEntry[] = [];
  const seen = new Set<string>();

  for (const animation of animations) {
    if (seen.has(animation.animationKey)) {
      throw new Error(`Duplicate animation key: ${animation.animationKey}`);
    }
    seen.add(animation.animationKey);

    const frames: AnimationJsonFrame[] = animation.frameNames.map(
      (frameName) => ({
        key: animation.textureKey,
        frame: frameName,
        duration: 0,
      }),
    );

    anims.push({
      key: animation.animationKey,
      type: "frame",
      frames,
      frameRate: animation.fps,
      skipMissedFrames: true,
      delay: 0,
      repeat: animation.repeat,
      repeatDelay: 0,
      yoyo: false,
    });
  }

  return { anims, globalTimeScale: 1 };
}

export function buildMarkerManifest(
  animations: readonly AnimationInput[],
): MarkerManifest {
  const markers: MarkerEntry[] = [];

  for (const animation of animations) {
    if (!animation.markers?.length) continue;
    for (const m of animation.markers) {
      markers.push({
        id: m.id,
        time: m.time,
        label: m.label,
        animationKey: animation.animationKey,
      });
    }
  }

  markers.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));

  return { version: 1, markers };
}
