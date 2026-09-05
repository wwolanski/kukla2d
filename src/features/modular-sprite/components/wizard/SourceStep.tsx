import { Input } from '@/components/ui/input';

const UiInput = Input as React.ComponentType<React.InputHTMLAttributes<HTMLInputElement>>;

export function SourceStep({ onFile }: { onFile: (file: File) => void }): React.ReactElement {
  return (
    <label
      className="flex h-full min-h-80 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 p-8 text-center hover:border-primary/60"
      onDragOver={event => event.preventDefault()}
      onDrop={event => {
        event.preventDefault();
        const dropped = event.dataTransfer.files[0];
        if (dropped) onFile(dropped);
      }}
    >
      <span className="text-lg font-medium">Drop a PNG, JPEG, or WebP sheet</span>
      <span className="mt-2 text-sm text-muted-foreground">Up to 50 MiB, 8192 px per side, and 20 megapixels</span>
      <UiInput className="mt-6 max-w-sm" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
        const selected = event.target.files?.[0];
        if (selected) onFile(selected);
      }} />
    </label>
  );
}

