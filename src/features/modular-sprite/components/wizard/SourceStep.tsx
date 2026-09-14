import { Loader2, Upload } from "lucide-react";
import { useState } from "react";

import { BorderBeam } from "@/components/ui/border-beam";
import { Input } from "@/components/ui/input";

const UiInput = Input as React.ComponentType<
  React.InputHTMLAttributes<HTMLInputElement>
>;

const exampleAssetUrls = import.meta.glob<string>(
  "../../assets/examples/*.png",
  { eager: true, query: "?url", import: "default" },
);

const MODULAR_SPRITE_EXAMPLES = [
  {
    id: "armored-panda",
    name: "Armored Panda",
    fileName: "armored-panda.png",
    url: exampleAssetUrls["../../assets/examples/armored-panda.png"]!,
  },
  {
    id: "arcane-wizard",
    name: "Arcane Wizard",
    fileName: "arcane-wizard.png",
    url: exampleAssetUrls["../../assets/examples/arcane-wizard.png"]!,
  },
] as const;

type ModularSpriteExample = (typeof MODULAR_SPRITE_EXAMPLES)[number];

export function SourceStep({
  onFile,
  highlightFirstExample = false,
}: {
  onFile: (file: File) => void;
  highlightFirstExample?: boolean;
}): React.ReactElement {
  const [loadingExampleId, setLoadingExampleId] = useState<string | null>(null);
  const [exampleError, setExampleError] = useState<string | null>(null);

  const handleExampleSelect = async (
    example: ModularSpriteExample,
  ): Promise<void> => {
    setLoadingExampleId(example.id);
    setExampleError(null);
    try {
      const response = await fetch(example.url);
      if (!response.ok) {
        throw new Error(`Could not load ${example.name}`);
      }
      const blob = await response.blob();
      onFile(
        new File([blob], example.fileName, {
          type: blob.type || "image/png",
        }),
      );
    } catch (error) {
      setExampleError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingExampleId(null);
    }
  };

  return (
    <div className="grid h-full min-h-80 min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <label
        className="flex min-h-80 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 p-8 text-center hover:border-primary/60"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const dropped = event.dataTransfer.files[0];
          if (dropped) onFile(dropped);
        }}
      >
        <Upload className="mb-4 h-8 w-8 text-muted-foreground" aria-hidden />
        <span className="text-lg font-medium">
          Drop a PNG, JPEG, or WebP sheet
        </span>
        <span className="mt-2 text-sm text-muted-foreground">
          Up to 50 MiB, 8192 px per side, and 20 megapixels
        </span>
        <UiInput
          className="mt-6 max-w-sm"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) onFile(selected);
          }}
        />
      </label>

      <section className="flex min-h-80 min-w-0 flex-col overflow-hidden rounded-xl border bg-card/40">
        <div className="shrink-0 border-b px-4 py-3">
          <h2
            className="text-sm font-semibold"
            id="modular-sprite-library-title"
          >
            Library
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Start with a built-in example or choose your own sheet.
          </p>
        </div>

        <ul
          className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
          aria-labelledby="modular-sprite-library-title"
        >
          {MODULAR_SPRITE_EXAMPLES.map((example, index) => {
            const isLoading = loadingExampleId === example.id;
            const isHighlighted = highlightFirstExample && index === 0;
            return (
              <li key={example.id}>
                <button
                  type="button"
                  className={`relative flex w-full items-center gap-3 overflow-hidden rounded-lg border bg-background/70 p-2 text-left transition-colors hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-60 ${isHighlighted ? "border-red-500/70" : "border-border/80 hover:border-primary/60"}`}
                  disabled={loadingExampleId !== null}
                  onClick={() => void handleExampleSelect(example)}
                >
                  {isHighlighted && (
                    <BorderBeam
                      duration={3.5}
                      color="hsl(0 84% 60%)"
                      highlightColor="hsl(350 89% 72%)"
                    />
                  )}
                  <img
                    src={example.url}
                    alt=""
                    loading="lazy"
                    className="h-16 w-16 shrink-0 rounded-md border bg-muted/30 object-contain p-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {example.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {example.fileName}
                    </span>
                  </span>
                  {isLoading && (
                    <Loader2
                      className="h-4 w-4 shrink-0 animate-spin text-primary"
                      aria-label={`Loading ${example.name}`}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {exampleError && (
          <p
            className="shrink-0 border-t px-3 py-2 text-[11px] text-destructive"
            role="alert"
          >
            {exampleError}
          </p>
        )}
      </section>
    </div>
  );
}
