export { AutoMotionPanel } from "@/features/auto-motion/components/AutoMotionPanel.jsx";
export {
  clearPreviewModifierDraft,
  getPreviewModifierDraft,
  setPreviewModifierDraft,
} from "@/features/auto-motion/application/previewModifierStore.js";
export {
  useAddMotionWizard,
  WIZARD_STEPS,
  IDLE_BREATHING_ID,
  HEAD_CHEEK_JIGGLE_ID,
  JIGGLE_DEFAULTS,
} from "@/features/auto-motion/application/useAddMotionWizard.js";
export type {
  MotionPresetId,
  BindingValue,
  Bindings,
  CheekPick,
  JiggleSettings,
  UseAddMotionWizardProps,
  UseAddMotionWizardResult,
} from "@/features/auto-motion/application/useAddMotionWizard.types.js";
