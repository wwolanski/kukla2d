import { HelpIcon } from '@/components/ui/help-icon.jsx';
import { Label } from '@/components/ui/label.jsx';

export function SectionTitle({ children, help }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
      {children}
      {help && <HelpIcon tip={help} />}
    </p>
  );
}

export function InspectorRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <Label className="text-xs text-muted-foreground shrink-0">{label}</Label>
      <div className="flex-1 flex items-center justify-end gap-2">{children}</div>
    </div>
  );
}
