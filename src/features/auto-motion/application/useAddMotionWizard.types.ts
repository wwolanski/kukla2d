import type { MotionPresetRole } from "@/domain/autoMotion/autoMotionTypes.types.js";

import type {
  HEAD_CHEEK_JIGGLE_ID,
  IDLE_BREATHING_ID,
} from "./useAddMotionWizard.js";

export type MotionPresetId =
  typeof IDLE_BREATHING_ID | typeof HEAD_CHEEK_JIGGLE_ID;

export interface BindingValue {
  nodeId?: string;
  boneId?: string;
  skipped?: boolean;
}

export interface Bindings {
  chest?: BindingValue;
  sourceBone?: BindingValue;
  facePart?: BindingValue;
  [key: string]: BindingValue | undefined;
}

export interface CheekPick {
  nodeId: string;
  localPoint: { x: number; y: number };
  worldPoint: { x: number; y: number };
}

export interface JiggleSettings {
  cheekRadius: number;
  strength: number;
  gain: number;
  deadZone: number;
}

export interface UseAddMotionWizardProps {
  open: boolean;
  onClose?: () => void;
}

export interface UseAddMotionWizardResult {
  stepIndex: number;
  selectedPresetId: MotionPresetId;
  bindings: Bindings;
  jiggleSettings: JiggleSettings;
  cheekPick: CheekPick | null;
  canvasPickRole: string | null;
  error: string | null;
  isIdleBreathing: boolean;
  presetRoles: Record<string, MotionPresetRole> | null;
  chestBinding: BindingValue | undefined;
  chestBound: boolean;
  hasValidMesh: boolean;
  sourceBoneId: string | null;
  sourceBoneSelected: boolean;
  faceBinding: BindingValue | undefined;
  faceBound: boolean;
  faceHasValidMesh: boolean;
  cheekPicked: boolean;
  canCreate: boolean;
  handleBindingChange: (roleKey: string, value: BindingValue) => void;
  startCanvasPick: (roleKey: string) => void;
  startCheekPick: () => void;
  cancelCanvasPick: () => void;
  handleNext: () => void;
  handleBack: () => void;
  handleClose: () => void;
  handleCreate: () => void;
  handlePresetSelect: (presetId: MotionPresetId) => void;
  updateJiggleSetting: (key: keyof JiggleSettings, value: number) => void;
}
