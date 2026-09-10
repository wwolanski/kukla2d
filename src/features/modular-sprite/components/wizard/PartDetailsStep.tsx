import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  SchemaEditor,
  type NewSchemaMetadata,
} from "@/features/modular-sprite-schema";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

import { FieldLabel } from "./FieldLabel.js";
import { PartThumbnail } from "../preview/PartThumbnail.js";

import type {
  ModularSpriteDraftPart,
  ProcessedModularSprite,
} from "../../domain/contracts.types.js";
import type { RegionGrouping } from "../../domain/partGrouping.types.js";

const UiButton = Button as React.ComponentType<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }
>;
const UiInput = Input as React.ComponentType<
  React.InputHTMLAttributes<HTMLInputElement>
>;

interface AttributeRow {
  id: number;
  key: string;
  value: string;
}

function serializedAttributes(
  value: Record<string, string> | undefined,
): string {
  return JSON.stringify(
    Object.entries(value ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function AdditionalAttributesEditor({
  value,
  onChange,
}: {
  value: Record<string, string> | undefined;
  onChange: (value: Record<string, string>) => void;
}): React.ReactElement {
  const nextId = useRef(0);
  const makeRows = (
    attributes: Record<string, string> | undefined,
  ): AttributeRow[] =>
    Object.entries(attributes ?? {}).map(([key, itemValue]) => ({
      id: nextId.current++,
      key,
      value: itemValue,
    }));
  const [rows, setRows] = useState<AttributeRow[]>(() => makeRows(value));
  const serializedValue = serializedAttributes(value);
  const lastEmitted = useRef(serializedValue);

  useEffect(() => {
    if (serializedValue === lastEmitted.current) return;
    lastEmitted.current = serializedValue;
    setRows(makeRows(value));
  }, [serializedValue, value]);

  const emit = (nextRows: readonly AttributeRow[]): void => {
    const attributes: Record<string, string> = {};
    const used = new Set<string>();
    for (const row of nextRows) {
      const key = row.key.trim();
      const normalizedKey = key.toLowerCase();
      if (!key || used.has(normalizedKey)) continue;
      used.add(normalizedKey);
      attributes[key] = row.value;
    }
    const serialized = serializedAttributes(attributes);
    if (serialized === lastEmitted.current) return;
    lastEmitted.current = serialized;
    onChange(attributes);
  };

  const updateRow = (
    rowId: number,
    field: "key" | "value",
    fieldValue: string,
  ): void => {
    const next = rows.map((row) =>
      row.id === rowId ? { ...row, [field]: fieldValue } : row,
    );
    setRows(next);
    emit(next);
  };

  const normalizedKeys = rows.map((row) => row.key.trim().toLowerCase());

  return (
    <details className="rounded-md border bg-muted/20 px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium">
        Additional attributes (optional)
      </summary>
      <div className="mt-3 grid gap-2">
        <p className="text-xs text-muted-foreground">
          Add metadata only when role and side are not specific enough.
        </p>
        {rows.map((row, index) => {
          const normalizedKey = normalizedKeys[index] ?? "";
          const duplicate =
            Boolean(normalizedKey) &&
            normalizedKeys.indexOf(normalizedKey) !== index;
          return (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_1fr_auto] items-start gap-2"
            >
              <div className="grid gap-1">
                <UiInput
                  className={duplicate ? "border-destructive" : ""}
                  aria-label={`Attribute ${index + 1}`}
                  placeholder="Attribute"
                  value={row.key}
                  onChange={(event) =>
                    updateRow(row.id, "key", event.target.value)
                  }
                />
                {duplicate && (
                  <span className="text-[11px] text-destructive">
                    Attribute names must be unique.
                  </span>
                )}
              </div>
              <UiInput
                aria-label={`Value ${index + 1}`}
                placeholder="Value"
                value={row.value}
                onChange={(event) =>
                  updateRow(row.id, "value", event.target.value)
                }
              />
              <UiButton
                size="icon"
                variant="ghost"
                aria-label={`Remove attribute ${index + 1}`}
                title="Remove attribute"
                onClick={() => {
                  const next = rows.filter((item) => item.id !== row.id);
                  setRows(next);
                  emit(next);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </UiButton>
            </div>
          );
        })}
        <UiButton
          className="w-fit"
          size="sm"
          variant="outline"
          onClick={() =>
            setRows((current) => [
              ...current,
              { id: nextId.current++, key: "", value: "" },
            ])
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          Add attribute
        </UiButton>
      </div>
    </details>
  );
}

export function PartDetailsStep({
  grouping,
  resultRef,
  resultVersion,
  schema,
  onUpdatePart,
  onSchemaEditorChange,
}: {
  grouping: RegionGrouping;
  resultRef: React.RefObject<ProcessedModularSprite | null>;
  resultVersion: number;
  schema: {
    addSchema: boolean;
    saveMode: "new" | "revision";
    metadata: NewSchemaMetadata;
    applied: boolean;
  };
  onUpdatePart: (
    index: number,
    change: Partial<ModularSpriteDraftPart>,
  ) => void;
  onSchemaEditorChange: (value: {
    addSchema?: boolean;
    saveMode?: "new" | "revision";
    metadata?: NewSchemaMetadata;
  }) => void;
}): React.ReactElement {
  return (
    <ScrollArea className="h-full min-h-0 min-w-0">
      <div className="mx-auto max-w-3xl space-y-3">
        <p className="text-sm text-muted-foreground">
          Review the part names and ordering. Roles were assigned in the
          previous step; technical extraction data is managed automatically.
        </p>
        {grouping.parts.map((part, index) => (
          <div key={index} className="space-y-3 rounded-lg border p-3">
            <div className="flex gap-3">
              <PartThumbnail
                resultRef={resultRef}
                resultVersion={resultVersion}
                regionIds={part.regionIds}
              />
              <div className="grid min-w-0 flex-1 content-start gap-3">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_90px] items-end gap-2">
                  <FieldLabel>
                    Name
                    <UiInput
                      value={part.name}
                      onChange={(event) =>
                        onUpdatePart(index, { name: event.target.value })
                      }
                    />
                  </FieldLabel>
                  <FieldLabel>
                    Stable key
                    <UiInput
                      className="cursor-default bg-muted/50 text-muted-foreground"
                      value={part.partKey}
                      readOnly
                      aria-readonly="true"
                      title="Generated automatically from the part name"
                    />
                  </FieldLabel>
                  <FieldLabel>
                    Side (optional)
                    <select
                      className="h-10 rounded-md border bg-background px-2"
                      value={part.side}
                      title="Distinguishes mirrored parts such as the left and right arm"
                      onChange={(event) =>
                        onUpdatePart(index, {
                          side: event.target
                            .value as ModularSpriteDraftPart["side"],
                        })
                      }
                    >
                      <option value="none">Not specified</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                      <option value="center">Center</option>
                    </select>
                  </FieldLabel>
                  <FieldLabel>
                    Layer order
                    <UiInput
                      type="number"
                      value={part.order}
                      onChange={(event) =>
                        onUpdatePart(index, {
                          order: Number(event.target.value),
                        })
                      }
                    />
                  </FieldLabel>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Side is only needed to distinguish mirrored parts with the
                  same role. The stable key follows the name and stays unique
                  automatically.
                </p>
                <AdditionalAttributesEditor
                  value={part.qualifiers}
                  onChange={(qualifiers) => onUpdatePart(index, { qualifiers })}
                />
              </div>
            </div>
          </div>
        ))}
        <SchemaEditor
          enabled={schema.addSchema}
          onEnabledChange={(value) =>
            onSchemaEditorChange({ addSchema: value })
          }
          value={schema.metadata}
          onChange={(metadata) => onSchemaEditorChange({ metadata })}
          existingApplied={schema.applied}
          canRevise={schema.applied}
          saveMode={schema.saveMode}
          onSaveModeChange={(saveMode) => onSchemaEditorChange({ saveMode })}
        />
      </div>
    </ScrollArea>
  );
}
