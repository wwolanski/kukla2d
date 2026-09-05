import type { ModularSpriteWizardStep } from '../../application/wizardState.js';

const STEPS: ModularSpriteWizardStep[] = ['source', 'background', 'regions', 'parts', 'review'];
const STEP_LABELS: Record<ModularSpriteWizardStep, string> = {
  source: 'Source',
  background: 'Background & cleanup',
  regions: 'Group regions',
  parts: 'Part details',
  review: 'Review',
};

export function WizardHeader({ title, step }: { title: string; step: ModularSpriteWizardStep }): React.ReactElement {
  return (
    <>
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">Extract reusable transparent parts from an alpha or controlled chroma-key sheet.</p>
      </div>
      <div className="flex border-b px-6 py-2">
        {STEPS.map((item, index) => <div key={item} className={`flex-1 text-center text-xs font-medium capitalize ${item === step ? 'text-primary' : 'text-muted-foreground'}`}>{index + 1}. {STEP_LABELS[item]}</div>)}
      </div>
    </>
  );
}

