export interface AnimationJsonFrame {
  key: string;
  frame: string;
  duration: number;
}

export interface AnimationJsonEntry {
  key: string;
  type: "frame";
  frames: AnimationJsonFrame[];
  frameRate: number;
  skipMissedFrames: boolean;
  delay: number;
  repeat: number;
  repeatDelay: number;
  yoyo: boolean;
}

export interface AnimationJson {
  anims: AnimationJsonEntry[];
  globalTimeScale: number;
}

export interface MarkerEntry {
  id: string;
  time: number;
  label: string;
  animationKey: string;
}

export interface MarkerManifest {
  version: 1;
  markers: MarkerEntry[];
}

export interface AnimationInput {
  animId: string;
  animName: string;
  animationKey: string;
  textureKey: string;
  frameNames: string[];
  fps: number;
  repeat: number;
  markers?: Array<{ id: string; time: number; label: string }>;
}
