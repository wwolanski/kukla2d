import { Check } from "lucide-react";

import type {
  SemanticCatalog,
  SemanticDefinition,
} from "@kukla2d/modular-sprite-schema";

import {
  SchemaEditor,
  SemanticRolePicker,
  type NewSchemaMetadata,
} from "@/features/modular-sprite-schema";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { FieldLabel } from "./FieldLabel.js";
import { slugPartKey } from "../../application/partDraftFactory.js";
import { PartThumbnail } from "../preview/PartThumbnail.js";

import type {
  ModularSpriteDraftPart,
  ProcessedModularSprite,
} from "../../domain/contracts.js";
import type { RegionGrouping } from "../../domain/partGrouping.js";

const UiButton = Button as React.ComponentType<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }
>;
const UiInput = Input as React.ComponentType<
  React.InputHTMLAttributes<HTMLInputElement>
>;

function parseQualifiers(value: string): Record<string, string> {
  const qualifiers: Record<string, string> = {};
  for (const entry of value.split(",")) {
    const [rawKey, ...rawValue] = entry.split("=");
    const key = rawKey?.trim() ?? "";
    const itemValue = rawValue.join("=").trim();
    if (key && itemValue) qualifiers[key] = itemValue;
  }
  return qualifiers;
}

export function PartDetailsStep({
  grouping,
  confirmedPartKeys,
  resultRef,
  resultVersion,
  advancedFrameKeys,
  schema,
  semanticCatalog,
  onSaveSemantic,
  onUpdatePart,
  onUpdateFrame,
  onRemovePart,
  onToggleFrame,
  onConfirmPart,
  onSchemaEditorChange,
}: {
  grouping: RegionGrouping;
  confirmedPartKeys: readonly string[];
  resultRef: React.RefObject<ProcessedModularSprite | null>;
  resultVersion: number;
  advancedFrameKeys: ReadonlySet<string>;
  schema: {
    addSchema: boolean;
    saveMode: "new" | "revision";
    metadata: NewSchemaMetadata;
    applied: boolean;
  };
  semanticCatalog: SemanticCatalog;
  onSaveSemantic: (definition: SemanticDefinition) => Promise<void>;
  onUpdatePart: (
    index: number,
    change: Partial<ModularSpriteDraftPart>,
  ) => void;
  onUpdateFrame: (
    index: number,
    field: "x" | "y" | "width" | "height",
    value: number,
  ) => void;
  onRemovePart: (index: number) => void;
  onToggleFrame: (partKey: string) => void;
  onConfirmPart: (partKey: string) => void;
  onSchemaEditorChange: (value: {
    addSchema?: boolean;
    saveMode?: "new" | "revision";
    metadata?: NewSchemaMetadata;
  }) => void;
}): React.ReactElement {
  const confirmed = new Set(confirmedPartKeys);
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <p className="text-sm text-muted-foreground">
        Name each imported part and describe what it represents. Name identifies
        this specific image; role describes its reusable anatomical meaning.
        Then confirm each part. Excluded regions from the previous step are not
        imported.
      </p>
      {grouping.parts.map((part, index) => (
        <div
          key={`${part.partKey}-${index}`}
          className="space-y-3 rounded-lg border p-3"
        >
          <div className="flex gap-3">
            <PartThumbnail
              resultRef={resultRef}
              resultVersion={resultVersion}
              regionIds={part.regionIds}
            />
            <div className="grid min-w-0 flex-1 content-start gap-2">
              <div className="grid grid-cols-[1fr_1fr_150px_110px_70px] items-end gap-2">
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
                    value={part.partKey}
                    onChange={(event) =>
                      onUpdatePart(index, {
                        partKey: slugPartKey(event.target.value),
                      })
                    }
                  />
                </FieldLabel>
                <FieldLabel>
                  Role
                  <SemanticRolePicker
                    role={part.role}
                    {...(part.semanticRoleId
                      ? { semanticRoleId: part.semanticRoleId }
                      : {})}
                    semantics={semanticCatalog}
                    onSaveSemantic={onSaveSemantic}
                    onChange={(value) => onUpdatePart(index, value)}
                  />
                </FieldLabel>
                <FieldLabel>
                  Side
                  <select
                    className="h-10 rounded-md border bg-background px-2"
                    value={part.side}
                    onChange={(event) =>
                      onUpdatePart(index, {
                        side: event.target
                          .value as ModularSpriteDraftPart["side"],
                      })
                    }
                  >
                    <option value="none">none</option>
                    <option value="left">left</option>
                    <option value="right">right</option>
                    <option value="center">center</option>
                  </select>
                </FieldLabel>
                <FieldLabel>
                  Order
                  <UiInput
                    type="number"
                    value={part.order}
                    onChange={(event) =>
                      onUpdatePart(index, { order: Number(event.target.value) })
                    }
                  />
                </FieldLabel>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={part.required}
                    onChange={(event) =>
                      onUpdatePart(index, { required: event.target.checked })
                    }
                  />
                  Required
                </label>
                <UiButton
                  size="sm"
                  variant={confirmed.has(part.partKey) ? "outline" : "default"}
                  onClick={() => onConfirmPart(part.partKey)}
                >
                  <Check className="mr-1 h-3 w-3" />
                  {confirmed.has(part.partKey) ? "Confirmed" : "Confirm"}
                </UiButton>
                <UiButton
                  size="sm"
                  variant="ghost"
                  onClick={() => onToggleFrame(part.partKey)}
                >
                  {advancedFrameKeys.has(part.partKey)
                    ? "Hide extraction frame"
                    : "Extraction frame"}
                </UiButton>
                <UiButton
                  className="ml-auto"
                  size="sm"
                  variant="destructive"
                  onClick={() => onRemovePart(index)}
                >
                  Remove part
                </UiButton>
              </div>
              <details className="rounded-md border bg-muted/20 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium">
                  Additional attributes (optional)
                </summary>
                <div className="mt-2 grid gap-2">
                  <p className="text-xs text-muted-foreground">
                    Use these when role and side are not specific enough. They
                    help schemas distinguish details such as an upper wing, a
                    lower limb segment, or one finger.
                  </p>
                  <FieldLabel>
                    Attributes
                    <UiInput
                      placeholder="segment=lower, limbIndex=3"
                      value={Object.entries(part.qualifiers ?? {})
                        .map(([key, value]) => `${key}=${value}`)
                        .join(", ")}
                      onChange={(event) =>
                        onUpdatePart(index, {
                          qualifiers: parseQualifiers(event.target.value),
                        })
                      }
                    />
                  </FieldLabel>
                  <p className="text-[11px] text-muted-foreground">
                    Format: <code>name=value</code>, separated with commas.
                  </p>
                </div>
              </details>
            </div>
          </div>
          {advancedFrameKeys.has(part.partKey) && (
            <div className="grid grid-cols-[repeat(4,1fr)] items-end gap-2 border-t pt-2">
              {(["x", "y", "width", "height"] as const).map((field) => (
                <FieldLabel key={field}>
                  Frame {field} (%)
                  <UiInput
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={Number(
                      (part.extractionFrame[field] * 100).toFixed(1),
                    )}
                    onChange={(event) =>
                      onUpdateFrame(
                        index,
                        field,
                        Number(event.target.value) / 100,
                      )
                    }
                  />
                </FieldLabel>
              ))}
            </div>
          )}
        </div>
      ))}
      <SchemaEditor
        enabled={schema.addSchema}
        onEnabledChange={(value) => onSchemaEditorChange({ addSchema: value })}
        value={schema.metadata}
        onChange={(metadata) => onSchemaEditorChange({ metadata })}
        existingApplied={schema.applied}
        canRevise={schema.applied}
        saveMode={schema.saveMode}
        onSaveModeChange={(saveMode) => onSchemaEditorChange({ saveMode })}
      />
    </div>
  );
}
