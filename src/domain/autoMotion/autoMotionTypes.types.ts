import type {
  AnimationModifier,
  BlendShape,
  ControlHandle,
  ModifierDriver,
  ModifierOutput,
} from "@kukla2d/contracts";

export interface MotionPresetRole {
  role: string;
  required: boolean;
  target: "handle" | "part" | "bone" | "warpDeformer";
  weight?: number;
  note?: string;
}

export interface MotionPresetDefinition {
  presetId: string;
  presetVersion: number;
  name: string;
  description: string;
  category: string;
  defaultDriver: ModifierDriver;
  roles: Record<string, MotionPresetRole>;
  defaultOutputs: ModifierOutput[];
  defaultParams: Record<string, number>;
}

export interface AutoMotionDraftOptions {
  strength?: number;
  params?: Record<string, number>;
  cheekRadius?: number;
  cheekPoint?: { x: number; y: number };
  gain?: number;
  deadZone?: number;
}

export type AutoMotionDraftResult =
  | { error: string; handles?: never; blendShapes?: never; modifier?: never }
  | {
      error?: never;
      handles: ControlHandle[];
      blendShapes: BlendShape[];
      modifier: AnimationModifier;
    };

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
