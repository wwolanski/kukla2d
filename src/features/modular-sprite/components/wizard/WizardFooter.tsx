import type { ModularSpriteWizardStep } from "@/features/modular-sprite/application/wizardState.types.js";

import { Button } from "@/components/ui/button";

const UiButton = Button as React.ComponentType<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }
>;

export function WizardFooter({
  step,
  busy,
  canGoNext,
  onCancel,
  onBack,
  onNext,
  onFinalize,
}: {
  step: ModularSpriteWizardStep;
  busy: boolean;
  canGoNext: boolean;
  onCancel: () => void;
  onBack: () => void;
  onNext: () => void;
  onFinalize: () => void;
}): React.ReactElement {
  return (
    <footer className="flex items-center gap-2 border-t px-6 py-3">
      <UiButton variant="ghost" onClick={onCancel}>
        Cancel
      </UiButton>
      <span className="flex-1" />
      {step !== "source" && (
        <UiButton variant="outline" disabled={busy} onClick={onBack}>
          Back
        </UiButton>
      )}
      {(step === "background" || step === "regions" || step === "parts") && (
        <UiButton disabled={busy || !canGoNext} onClick={onNext}>
          Continue
        </UiButton>
      )}
      {step === "review" && (
        <UiButton disabled={busy} onClick={onFinalize}>
          {busy ? "Finalizing…" : "Import set"}
        </UiButton>
      )}
      {busy && step === "review" && (
        <span className="text-xs text-muted-foreground">Finalizing…</span>
      )}
      {step === "review" && !busy && (
        <span aria-live="polite" className="sr-only" />
      )}
    </footer>
  );
}
