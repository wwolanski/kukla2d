import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ModularSpriteSchema } from "@kukla2d/modular-sprite-schema";

import type {
  SchemaLibraryOriginFilter,
  SchemaLibrarySource,
  SchemaLibraryStatus,
} from "@/features/schema-library/application/schemaLibrarySource.types.js";

export interface SchemaLibraryController {
  status: SchemaLibraryStatus;
  error: string | null;
  schemas: readonly ModularSpriteSchema[];
  visibleSchemas: readonly ModularSpriteSchema[];
  selectedSchema: ModularSpriteSchema | undefined;
  selectedId: string | null;
  search: string;
  originFilter: SchemaLibraryOriginFilter;
  assetUrls: Readonly<Record<string, string>>;
  source: SchemaLibrarySource;
  setSearch: (value: string) => void;
  setOriginFilter: (value: SchemaLibraryOriginFilter) => void;
  selectSchema: (schemaId: string) => void;
  refresh: () => Promise<void>;
}

function assetRefs(schema: ModularSpriteSchema): string[] {
  const refs = [schema.thumbnailAsset?.assetId, schema.referenceAsset.assetId];
  return [...new Set(refs.filter((value): value is string => Boolean(value)))];
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeAssetUrl(blob: Blob): string | undefined {
  if (typeof URL.createObjectURL !== "function") return undefined;
  return URL.createObjectURL(blob);
}

export function filterSchemaLibrary(
  schemas: readonly ModularSpriteSchema[],
  search: string,
  originFilter: SchemaLibraryOriginFilter,
): readonly ModularSpriteSchema[] {
  const query = search.trim().toLocaleLowerCase();
  return schemas.filter((schema) => {
    const isLocal =
      schema.origin.kind === "builtin" || schema.origin.kind === "user";
    if (
      originFilter !== "all" &&
      (originFilter === "local" ? !isLocal : schema.origin.kind !== originFilter)
    ) {
      return false;
    }
    if (!query) return true;
    return [
      schema.name,
      schema.description,
      schema.schemaId,
      schema.origin.sourceId,
      ...schema.tags,
      ...schema.characterTypeIds,
      ...schema.characterClassIds,
    ]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(query));
  });
}

export function useSchemaLibraryController(
  source: SchemaLibrarySource,
): SchemaLibraryController {
  const [status, setStatus] = useState<SchemaLibraryStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [schemas, setSchemas] = useState<readonly ModularSpriteSchema[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] =
    useState<SchemaLibraryOriginFilter>("all");
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef<Map<string, string>>(new Map());
  const requestRef = useRef(0);

  const revokeAssets = useCallback(() => {
    for (const url of urlsRef.current.values()) URL.revokeObjectURL(url);
    urlsRef.current.clear();
    setAssetUrls({});
  }, []);

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;
    revokeAssets();
    setStatus("loading");
    setError(null);
    try {
      await source.initialize();
      const nextSchemas = [...(await source.list())];
      if (requestId !== requestRef.current) return;
      setSchemas(nextSchemas);
      setSelectedId((current) =>
        current && nextSchemas.some((schema) => schema.schemaId === current)
          ? current
          : (nextSchemas[0]?.schemaId ?? null),
      );

      const nextUrls = new Map<string, string>();
      const uniqueRefs = [
        ...new Set(nextSchemas.flatMap((schema) => assetRefs(schema))),
      ];
      await Promise.all(
        uniqueRefs.map(async (assetId) => {
          try {
            const blob = await source.getAsset(assetId);
            if (!blob) return;
            const url = makeAssetUrl(blob);
            if (url) nextUrls.set(assetId, url);
          } catch {
            // A missing optional asset falls back to the normalized layout preview.
          }
        }),
      );
      if (requestId !== requestRef.current) {
        for (const url of nextUrls.values()) URL.revokeObjectURL(url);
        return;
      }
      urlsRef.current = nextUrls;
      setAssetUrls(Object.fromEntries(nextUrls));
      setStatus("ready");
    } catch (loadError) {
      if (requestId !== requestRef.current) return;
      setSchemas([]);
      setSelectedId(null);
      setStatus("error");
      setError(describeError(loadError));
    }
  }, [revokeAssets, source]);

  useEffect(() => {
    void refresh();
    return () => {
      requestRef.current += 1;
      revokeAssets();
    };
  }, [refresh, revokeAssets]);

  const visibleSchemas = useMemo(
    () => filterSchemaLibrary(schemas, search, originFilter),
    [originFilter, schemas, search],
  );
  const selectedSchema = useMemo(
    () =>
      schemas.find((schema) => schema.schemaId === selectedId) ??
      visibleSchemas[0],
    [schemas, selectedId, visibleSchemas],
  );

  return {
    status,
    error,
    schemas,
    visibleSchemas,
    selectedSchema,
    selectedId: selectedSchema?.schemaId ?? null,
    search,
    originFilter,
    assetUrls,
    source,
    setSearch,
    setOriginFilter,
    selectSchema: setSelectedId,
    refresh,
  };
}
