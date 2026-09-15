import { Search, X } from "lucide-react";

import type { ModularSpriteSchema } from "@kukla2d/modular-sprite-schema";

import type {
  SchemaLibraryOriginFilter,
  SchemaLibrarySource,
} from "@/features/schema-library/application/schemaLibrarySource.types.js";
import { useSchemaLibraryController } from "@/features/schema-library/application/useSchemaLibraryController.js";
import { SchemaReferencePreview } from "@/features/schema-library/components/SchemaReferencePreview.js";

import { Badge as RawBadge } from "@/components/ui/badge.jsx";
import { Button as RawButton } from "@/components/ui/button.jsx";
import { Card as RawCard, CardContent as RawCardContent } from "@/components/ui/card.jsx";
import {
  Dialog as RawDialog,
  DialogContent as RawDialogContent,
  DialogDescription as RawDialogDescription,
  DialogHeader as RawDialogHeader,
  DialogTitle as RawDialogTitle,
} from "@/components/ui/dialog.jsx";
import { Input as RawInput } from "@/components/ui/input.jsx";
import { ScrollArea } from "@/components/ui/scroll-area.js";
import { Select as RawSelect, SelectContent as RawSelectContent, SelectItem as RawSelectItem, SelectTrigger as RawSelectTrigger, SelectValue as RawSelectValue } from "@/components/ui/select.jsx";
import { Tabs as RawTabs, TabsContent as RawTabsContent, TabsList as RawTabsList, TabsTrigger as RawTabsTrigger } from "@/components/ui/tabs.jsx";

import type { ChangeEvent, ComponentType, PropsWithChildren } from "react";

type LooseProps = PropsWithChildren<Record<string, unknown>>;
const Badge = RawBadge as ComponentType<LooseProps>;
const Button = RawButton as ComponentType<LooseProps>;
const Dialog = RawDialog as ComponentType<LooseProps>;
const DialogContent = RawDialogContent as ComponentType<LooseProps>;
const DialogDescription = RawDialogDescription as ComponentType<LooseProps>;
const DialogHeader = RawDialogHeader as ComponentType<LooseProps>;
const DialogTitle = RawDialogTitle as ComponentType<LooseProps>;
const Input = RawInput as ComponentType<LooseProps>;
const Select = RawSelect as ComponentType<LooseProps>;
const SelectContent = RawSelectContent as ComponentType<LooseProps>;
const SelectItem = RawSelectItem as ComponentType<LooseProps>;
const SelectTrigger = RawSelectTrigger as ComponentType<LooseProps>;
const SelectValue = RawSelectValue as ComponentType<LooseProps>;
const Tabs = RawTabs as ComponentType<LooseProps>;
const TabsContent = RawTabsContent as ComponentType<LooseProps>;
const TabsList = RawTabsList as ComponentType<LooseProps>;
const TabsTrigger = RawTabsTrigger as ComponentType<LooseProps>;
const Card = RawCard as ComponentType<LooseProps>;
const CardContent = RawCardContent as ComponentType<LooseProps>;

function originLabel(schema: ModularSpriteSchema): string {
  return schema.origin.kind === "remote" ? "remote" : "local";
}

function assetUrl(
  schema: ModularSpriteSchema,
  urls: Readonly<Record<string, string>>,
): string | undefined {
  const assetId = schema.thumbnailAsset?.assetId ?? schema.referenceAsset.assetId;
  return urls[assetId];
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function Tags({ values }: { values: readonly string[] }): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((value) => (
        <Badge key={value} variant="secondary" className="text-[10px]">
          {value}
        </Badge>
      ))}
    </div>
  );
}

function SlotTable({ schema }: { schema: ModularSpriteSchema }): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[650px] text-left text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th className="p-2">Part / slot</th>
            <th className="p-2">Role</th>
            <th className="p-2">Side</th>
            <th className="p-2">Required</th>
            <th className="p-2">Draw order</th>
            <th className="p-2">Components</th>
          </tr>
        </thead>
        <tbody>
          {schema.slots.map((slot) => (
            <tr key={slot.slotKey} className="border-t align-top">
              <td className="p-2 font-medium">{slot.label}</td>
              <td className="p-2 font-mono">{slot.semanticRoleId ?? "—"}</td>
              <td className="p-2">{slot.qualifiers.side ?? "—"}</td>
              <td className="p-2">{slot.required ? "Yes" : "No"}</td>
              <td className="p-2 font-mono">{slot.drawOrder}</td>
              <td className="p-2 font-mono">{slot.components.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BasicDetails({ schema, urls }: { schema: ModularSpriteSchema; urls: Readonly<Record<string, string>> }): React.ReactElement {
  const reference = schema.referenceAsset;
  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-muted/20 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reference source</h3>
        <div className="flex min-h-[260px] items-center justify-center rounded-md border bg-background p-3">
          <SchemaReferencePreview schema={schema} src={assetUrl(schema, urls)} />
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{schema.name}</h3>
        <p className="text-sm text-muted-foreground">{schema.description || "No description provided."}</p>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded border p-2"><div className="text-muted-foreground">Canvas width</div><div className="font-mono">{reference.width}px</div></div>
          <div className="rounded border p-2"><div className="text-muted-foreground">Canvas height</div><div className="font-mono">{reference.height}px</div></div>
          <div className="rounded border p-2"><div className="text-muted-foreground">Aspect ratio</div><div className="font-mono">{schema.fingerprint.canvasAspectRatio.toFixed(4)}</div></div>
          <div className="rounded border p-2"><div className="text-muted-foreground">Islands</div><div className="font-mono">{schema.fingerprint.expectedIslandCount}</div></div>
        </div>
      </section>
      <section className="space-y-2"><h3 className="text-sm font-semibold">Classifications</h3><Tags values={[...schema.characterTypeIds, ...schema.characterClassIds]} /></section>
      <section className="space-y-2"><h3 className="text-sm font-semibold">Parts and slots</h3><SlotTable schema={schema} /></section>
    </div>
  );
}

function AdvancedDetails({ schema }: { schema: ModularSpriteSchema }): React.ReactElement {
  return (
    <div className="space-y-4 text-xs">
      <section className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
        <div><span className="text-muted-foreground">Schema ID:</span> <code>{schema.schemaId}</code></div>
        <div><span className="text-muted-foreground">Composition ID:</span> <code>{schema.compositionId}</code></div>
        <div><span className="text-muted-foreground">Revision:</span> <code>{schema.revision}</code></div>
        <div><span className="text-muted-foreground">Format version:</span> <code>{schema.formatVersion}</code></div>
        <div><span className="text-muted-foreground">Created:</span> <code>{schema.createdAt}</code></div>
        <div><span className="text-muted-foreground">Updated:</span> <code>{schema.updatedAt}</code></div>
        <div><span className="text-muted-foreground">Origin:</span> <code>{schema.origin.kind}</code></div>
        <div><span className="text-muted-foreground">Source:</span> <code>{schema.origin.sourceId ?? "—"}</code></div>
      </section>
      <section className="space-y-2"><h3 className="font-semibold">Asset references</h3><pre className="max-h-48 overflow-auto rounded-md bg-muted p-3">{json({ referenceAsset: schema.referenceAsset, thumbnailAsset: schema.thumbnailAsset })}</pre></section>
      <section className="space-y-2"><h3 className="font-semibold">Fingerprint</h3><pre className="max-h-80 overflow-auto rounded-md bg-muted p-3">{json(schema.fingerprint)}</pre></section>
      <section className="space-y-2"><h3 className="font-semibold">Matcher profile</h3><pre className="max-h-80 overflow-auto rounded-md bg-muted p-3">{json(schema.matcherProfile)}</pre></section>
      <section className="space-y-2"><h3 className="font-semibold">Slots and components</h3><pre className="max-h-96 overflow-auto rounded-md bg-muted p-3">{json(schema.slots)}</pre></section>
      <section className="space-y-2"><h3 className="font-semibold">Full JSON</h3><pre className="max-h-[32rem] overflow-auto rounded-md bg-muted p-3">{json(schema)}</pre></section>
    </div>
  );
}

export function SchemaLibraryModal({
  open,
  onOpenChange,
  source,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: SchemaLibrarySource;
}): React.ReactElement {
  const controller = useSchemaLibraryController(source);
  const { selectedSchema } = controller;
  const setOrigin = (value: string) => controller.setOriginFilter(value as SchemaLibraryOriginFilter);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-h-[900px] w-[min(1280px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b p-5 pb-4">
          <DialogTitle>Schema library</DialogTitle>
          <DialogDescription>{source.descriptor.label}: {source.descriptor.detail}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="flex min-h-0 w-full shrink-0 flex-col border-b md:w-[360px] md:border-b-0 md:border-r">
            <div className="space-y-2 border-b p-3">
              <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={controller.search} onChange={(event: ChangeEvent<HTMLInputElement>) => controller.setSearch(event.target.value)} placeholder="Search schemas, tags, IDs…" className="pl-8 pr-8" aria-label="Search schemas" />{controller.search && <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => controller.setSearch("")} aria-label="Clear search"><X className="h-3.5 w-3.5" /></Button>}</div>
              <Select value={controller.originFilter} onValueChange={setOrigin}>
                <SelectTrigger aria-label="Filter schema origin"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All origins</SelectItem><SelectItem value="local">Local</SelectItem><SelectItem value="remote">Remote</SelectItem></SelectContent>
              </Select>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-2 p-3">
                {controller.status === "loading" && <div className="p-8 text-center text-sm text-muted-foreground" role="status">Loading schemas…</div>}
                {controller.status === "error" && <div className="space-y-3 p-6 text-center"><p className="text-sm text-destructive" role="alert">{controller.error}</p><Button variant="outline" size="sm" onClick={() => void controller.refresh()}>Retry</Button></div>}
                {controller.status === "ready" && controller.visibleSchemas.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No schemas match this search.</div>}
                {controller.visibleSchemas.map((schema) => <SchemaCard key={schema.schemaId} schema={schema} selected={schema.schemaId === selectedSchema?.schemaId} src={assetUrl(schema, controller.assetUrls)} onSelect={() => controller.selectSchema(schema.schemaId)} />)}
              </div>
            </ScrollArea>
          </aside>
          <main className="min-h-0 min-w-0 flex-1">
            {controller.status === "ready" && selectedSchema ? <ScrollArea className="h-full"><div className="p-5"><Tabs defaultValue="basic"><TabsList className="mb-4 grid w-full max-w-xs grid-cols-2"><TabsTrigger value="basic">Basic</TabsTrigger><TabsTrigger value="advanced">Advanced</TabsTrigger></TabsList><TabsContent value="basic" className="mt-0"><BasicDetails schema={selectedSchema} urls={controller.assetUrls} /></TabsContent><TabsContent value="advanced" className="mt-0"><AdvancedDetails schema={selectedSchema} /></TabsContent></Tabs></div></ScrollArea> : <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">{controller.status === "loading" ? "Loading schema details…" : controller.status === "error" ? "Schema details are unavailable." : "Select a schema to inspect its details."}</div>}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SchemaCard({ schema, selected, src, onSelect }: { schema: ModularSpriteSchema; selected: boolean; src?: string | undefined; onSelect: () => void }): React.ReactElement {
  return <Card className={selected ? "border-primary ring-1 ring-primary" : ""}><button type="button" className="block w-full text-left" aria-pressed={selected} onClick={onSelect}><CardContent className="flex gap-3 p-3"><div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted"><SchemaReferencePreview schema={schema} src={src} /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{schema.name}</div><div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground"><span>{originLabel(schema)}</span><span>rev {schema.revision}</span><span>{schema.slots.length} slots</span></div><Tags values={schema.tags} /></div></CardContent></button></Card>;
}
