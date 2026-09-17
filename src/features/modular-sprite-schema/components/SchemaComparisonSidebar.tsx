import { Info } from "lucide-react";
import { useState } from "react";

import type {
  ModularSpriteSchema,
  SchemaComparisonResult,
} from "@kukla2d/modular-sprite-schema";

import { SchemaAnalysisDetailsDialog } from "@/features/modular-sprite-schema/components/SchemaAnalysisDetailsDialog.js";

import { ScrollArea } from "@/components/ui/scroll-area.js";

const percent = (basisPoints: number): string =>
  `${(basisPoints / 100).toFixed(2)}%`;

const SIMILARITY_COLORS = [
  "#7f1d1d",
  "#991b1b",
  "#dc2626",
  "#ef4444",
  "#ea580c",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#16a34a",
] as const;

const similarityColor = (basisPoints: number): string => {
  const clampedBasisPoints = Math.max(0, Math.min(10_000, basisPoints));
  const colorIndex = Math.min(
    Math.floor(clampedBasisPoints / 1_000),
    SIMILARITY_COLORS.length - 1,
  );
  return SIMILARITY_COLORS[colorIndex] ?? "#16a34a";
};

export function SchemaComparisonSidebar({
  enabled,
  onEnabledChange,
  analyzing,
  progress,
  matches,
  schemas,
  appliedSchemaId,
  onApply,
}: {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  analyzing: boolean;
  progress: { completed: number; total: number };
  matches: readonly SchemaComparisonResult[];
  schemas: readonly ModularSpriteSchema[];
  appliedSchemaId?: string;
  onApply: (match: SchemaComparisonResult) => void;
}): React.ReactElement {
  const [detailsMatch, setDetailsMatch] =
    useState<SchemaComparisonResult | null>(null);
  const byId = new Map(schemas.map((item) => [item.schemaId, item]));
  const detailsSchema = detailsMatch
    ? byId.get(detailsMatch.schemaId)
    : undefined;

  return (
    <>
      <ScrollArea className="h-full min-h-0 min-w-0 rounded-lg border">
        <aside className="space-y-3 p-3">
          <label className="flex items-center justify-between gap-2 text-xs font-medium">
            <span>Auto-match schema</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => onEnabledChange(event.target.checked)}
            />
          </label>
          {analyzing && (
            <p className="text-xs text-muted-foreground">
              Analyzing… {progress.completed} / {progress.total} schemas
            </p>
          )}
          {!analyzing && enabled && !matches.length && (
            <p className="text-xs text-muted-foreground">
              No schemas compared yet.
            </p>
          )}
          <div className="space-y-2">
            {matches.map((match) => {
              const matchColor = similarityColor(match.similarityBp);
              const verdictIcon =
                match.verdict === "match"
                  ? "✓"
                  : match.verdict === "no-match"
                    ? "✕"
                    : null;

              return (
                <details
                  key={`${match.schemaId}@${match.schemaRevision}`}
                  className="rounded border p-2"
                  open={match === matches[0]}
                >
                  <summary className="cursor-pointer text-xs">
                    <span className="font-medium">
                      {byId.get(match.schemaId)?.name ?? match.schemaId}
                    </span>
                    <span
                      className="float-right font-medium"
                      style={{ color: matchColor }}
                    >
                      {percent(match.similarityBp)}
                    </span>
                    <div className="mt-1 flex items-center gap-1 capitalize">
                      <span style={{ color: matchColor }}>
                        {match.confidence} confidence
                      </span>
                      <span className="text-muted-foreground" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className="inline-flex items-center gap-1 text-muted-foreground"
                      >
                        {verdictIcon && (
                          <span aria-hidden="true">{verdictIcon}</span>
                        )}
                        {match.verdict.replace("-", " ")}
                      </span>
                    </div>
                  </summary>
                  <div className="mt-2 space-y-1 border-t pt-2">
                    {match.analyzers.map((item) => (
                      <div
                        key={item.analyzerId}
                        className="flex justify-between text-[11px]"
                      >
                        <span>{item.analyzerId}</span>
                        <span>
                          {item.status === "scored"
                            ? percent(item.scoreBp)
                            : item.status}
                        </span>
                      </div>
                    ))}
                    {!!match.missingRequiredSlots.length && (
                      <p className="text-[11px] text-amber-500">
                        Missing: {match.missingRequiredSlots.join(", ")}
                      </p>
                    )}
                    {!!match.unmatchedComponentIds.length && (
                      <p className="text-[11px] text-muted-foreground">
                        Extra islands: {match.unmatchedComponentIds.join(", ")}
                      </p>
                    )}
                    <div className="mt-2 grid grid-cols-[36px_1fr] gap-2">
                      <button
                        type="button"
                        className="flex h-8 items-center justify-center rounded border hover:bg-muted"
                        title="Open detailed comparison report"
                        aria-label={`Show details for ${byId.get(match.schemaId)?.name ?? match.schemaId}`}
                        onClick={() => setDetailsMatch(match)}
                      >
                        <Info className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="h-8 rounded bg-primary px-2 text-xs text-primary-foreground disabled:opacity-50"
                        disabled={appliedSchemaId === match.schemaId}
                        onClick={() => onApply(match)}
                      >
                        {appliedSchemaId === match.schemaId
                          ? "Applied"
                          : "Apply schema"}
                      </button>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </aside>
      </ScrollArea>
      <SchemaAnalysisDetailsDialog
        match={detailsMatch}
        {...(detailsSchema ? { schema: detailsSchema } : {})}
        onClose={() => setDetailsMatch(null)}
      />
    </>
  );
}
