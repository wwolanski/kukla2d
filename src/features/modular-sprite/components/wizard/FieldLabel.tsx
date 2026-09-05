export function FieldLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return <label className="grid gap-1 text-xs text-muted-foreground">{children}</label>;
}

