import { Layers3, Loader2, PackagePlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AssetId } from "@kukla2d/contracts";

import { useProjectStore } from "@/store/projectStore";

import type {
  ModularSpriteCommitRequest,
  ModularSpriteCommitResult,
  RgbaImageData,
} from "@/features/modular-sprite";
import { commitGeneratedPackage } from "@/features/modular-sprite-generator/application/commitGeneratedPackage.js";
import { generateModularSprite } from "@/features/modular-sprite-generator/application/generateModularSprite.js";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

const UiDialog = Dialog as React.ComponentType<{
  open: boolean;
  onOpenChange(open: boolean): void;
  children: React.ReactNode;
}>;
const UiDialogContent = DialogContent as React.ComponentType<{
  className?: string;
  children: React.ReactNode;
}>;
const UiDialogHeader = DialogHeader as React.ComponentType<{
  className?: string;
  children: React.ReactNode;
}>;
const UiDialogFooter = DialogFooter as React.ComponentType<{
  className?: string;
  children: React.ReactNode;
}>;
const UiDialogTitle = DialogTitle as React.ComponentType<{
  className?: string;
  children: React.ReactNode;
}>;
const UiDialogDescription = DialogDescription as React.ComponentType<{
  children: React.ReactNode;
}>;
const UiInput = Input as React.ComponentType<
  React.InputHTMLAttributes<HTMLInputElement>
>;
const UiLabel = Label as React.ComponentType<
  React.LabelHTMLAttributes<HTMLLabelElement>
>;
const UiCheckbox = Checkbox as React.ComponentType<{
  checked?: boolean;
  onCheckedChange?(value: boolean | "indeterminate"): void;
}>;
const UiButton = Button as React.ComponentType<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }
>;

export interface ModularSpriteGeneratorIntent {
  existingId: string;
  includeAssetId?: string;
  removeAssetId?: string;
  force?: boolean;
  removeFromLibrary?: boolean;
}

interface ModularSpriteGeneratorImagePort {
  decode: (source: Blob | File) => Promise<RgbaImageData>;
  encode: (image: RgbaImageData) => Promise<Blob>;
}

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function libraryAssetImageType(blob: Blob, fileName?: string): string {
  if (SUPPORTED_IMAGE_TYPES.has(blob.type)) return blob.type;
  const extension = fileName?.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return "image/png";
}

interface ModularSpriteGeneratorDialogProps {
  open: boolean;
  intent: ModularSpriteGeneratorIntent | null;
  image: ModularSpriteGeneratorImagePort;
  onOpenChange: (open: boolean) => void;
  onCommit: (
    request: ModularSpriteCommitRequest,
  ) => Promise<ModularSpriteCommitResult>;
}

async function loadAsset(
  project: ReturnType<typeof useProjectStore.getState>["project"],
  assetId: string,
  imagePort: ModularSpriteGeneratorImagePort,
) {
  const texture = project.textures.find((candidate) => candidate.id === assetId);
  if (!texture) throw new Error(`Asset ${assetId} is missing from Library`);
  const response = await fetch(texture.source);
  if (!response.ok) throw new Error(`Could not read ${texture.name || assetId}`);
  const blob = await response.blob();
  const file = new File([blob], texture.fileName || `${texture.name}.png`, {
    // Blob URLs restored from an archive and some dev servers return a generic
    // response MIME. Library textures are already decoded raster assets, so use
    // their filename (or the package PNG default) instead of rejecting them.
    type: libraryAssetImageType(blob, texture.fileName),
  });
  return {
    assetId: assetId as AssetId,
    image: await imagePort.decode(file),
    blob,
  };
}

export function ModularSpriteGeneratorDialog({
  open,
  intent,
  image,
  onOpenChange,
  onCommit,
}: ModularSpriteGeneratorDialogProps): React.ReactElement {
  const project = useProjectStore((state) => state.project);
  const updateProject = useProjectStore((state) => state.updateProject);
  const target = project.modularSprites.find(
    (sprite) => sprite.id === intent?.existingId,
  );
  const [name, setName] = useState("");
  const [selectedLooseAssets, setSelectedLooseAssets] = useState<Set<string>>(
    new Set(),
  );
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(
    new Set(),
  );
  const [removedTargetAssets, setRemovedTargetAssets] = useState<Set<string>>(
    new Set(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      initializedSessionRef.current = null;
      return;
    }
    if (!target) return;
    const sessionKey = [
      target.id,
      intent?.includeAssetId ?? "",
      intent?.removeAssetId ?? "",
      intent?.force ? "force" : "",
      intent?.removeFromLibrary ? "library" : "package",
    ].join(":");
    if (initializedSessionRef.current === sessionKey) return;
    initializedSessionRef.current = sessionKey;
    setName(target.name);
    setSelectedLooseAssets(
      new Set(intent?.includeAssetId ? [intent.includeAssetId] : []),
    );
    setSelectedPackages(new Set());
    setRemovedTargetAssets(
      new Set(intent?.removeAssetId ? [intent.removeAssetId] : []),
    );
    setBusy(false);
    setError(null);
  }, [
    intent?.force,
    intent?.includeAssetId,
    intent?.removeAssetId,
    intent?.removeFromLibrary,
    open,
    target,
  ]);

  const packageAssetIds = useMemo(
    () =>
      new Set(
        project.modularSprites.flatMap((sprite) => [
          sprite.sourceAssetId,
          ...sprite.parts.map((part) => part.assetId),
        ]),
      ),
    [project.modularSprites],
  );
  const looseAssets = project.textures.filter(
    (texture) => !packageAssetIds.has(texture.id),
  );
  const otherPackages = project.modularSprites.filter(
    (sprite) => sprite.id !== target?.id,
  );

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
    checked: boolean,
  ) =>
    setter((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const handleGenerate = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const selectedOtherPackages = otherPackages.filter((sprite) =>
        selectedPackages.has(sprite.id),
      );
      const targetAssetIds = target.parts
        .map((part) => part.assetId)
        .filter((assetId) => !removedTargetAssets.has(assetId));
      const assetIds = [
        ...targetAssetIds,
        ...selectedLooseAssets,
        ...selectedOtherPackages.flatMap((sprite) =>
          sprite.parts.map((part) => part.assetId),
        ),
      ];
      const uniqueAssetIds = [...new Set(assetIds)];
      const assets = await Promise.all(
        uniqueAssetIds.map((assetId) => loadAsset(project, assetId, image)),
      );
      const generatedRequest = await generateModularSprite(
        {
          project,
          name,
          existingId: target.id,
          assets,
        },
        { encode: image.encode },
      );
      const request: ModularSpriteCommitRequest = {
        ...generatedRequest,
        ...(intent?.includeAssetId
          ? { includeAssetId: intent.includeAssetId }
          : {}),
        ...(intent?.force !== undefined ? { force: intent.force } : {}),
        ...(intent?.removeFromLibrary !== undefined
          ? { removeFromLibrary: intent.removeFromLibrary }
          : {}),
      };
      const removedFromTarget = target.parts
        .map((part) => part.assetId)
        .filter((assetId) => removedTargetAssets.has(assetId));
      const includedAssetOwnerId = intent?.includeAssetId
        ? project.modularSprites.find(
            (sprite) =>
              sprite.id !== target.id &&
              sprite.parts.some(
                (part) => part.assetId === intent.includeAssetId,
              ),
          )?.id
        : undefined;
      const mergedIds = new Set(
        selectedOtherPackages
          .map((sprite) => sprite.id)
          .filter((id) => id !== includedAssetOwnerId),
      );
      const mergedSourceIds = new Set<string>(
        selectedOtherPackages
          .filter((sprite) => mergedIds.has(sprite.id))
          .map((sprite) => String(sprite.sourceAssetId)),
      );
      const mergedFolderIds = new Set(
        project.assetPlacements
          .filter((placement) => mergedSourceIds.has(placement.assetId))
          .map((placement) => placement.folderId)
          .filter((folderId): folderId is string => Boolean(folderId)),
      );
      await commitGeneratedPackage(request, onCommit, updateProject, (draft) => {
        draft.modularSprites = draft.modularSprites.filter(
          (sprite) => !mergedIds.has(sprite.id),
        );
        draft.textures = draft.textures.filter(
          (texture) => !mergedSourceIds.has(texture.id),
        );
        draft.assetPlacements = draft.assetPlacements.filter(
          (placement) => !mergedSourceIds.has(placement.assetId),
        );
        draft.libraryFolders = draft.libraryFolders.filter(
          (folder) => !mergedFolderIds.has(folder.id),
        );
        if (request.removeFromLibrary === false) {
          for (const assetId of removedFromTarget) {
            const placement = draft.assetPlacements.find(
              (candidate) => candidate.assetId === assetId,
            );
            if (placement) placement.folderId = null;
            else draft.assetPlacements.push({ assetId, folderId: null });
          }
        }
      });
      onOpenChange(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not generate the modular sprite",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <UiDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <UiDialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
        <UiDialogHeader>
          <UiDialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5" />
            Regenerate modular sprite
          </UiDialogTitle>
          <UiDialogDescription>
            Rebuild the locked package from Library assets. Canvas placement
            chooses packing priority and canvas draw order becomes part order.
          </UiDialogDescription>
        </UiDialogHeader>

        <div className="grid gap-2">
          <UiLabel htmlFor="generator-name">Package name</UiLabel>
          <UiInput
            id="generator-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <ScrollArea className="min-h-0 flex-1 rounded-md border">
          <div className="space-y-5 p-4">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Current package</h3>
              {target?.parts.map((part) => {
                const included = !removedTargetAssets.has(part.assetId);
                return (
                  <label
                    key={part.assetId}
                    className="flex items-center gap-2 text-sm"
                  >
                    <UiCheckbox
                      checked={included}
                      onCheckedChange={(value) =>
                        toggle(
                          setRemovedTargetAssets,
                          part.assetId,
                          !Boolean(value),
                        )
                      }
                    />
                    {part.name}
                  </label>
                );
              })}
            </section>

            {looseAssets.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Add from Library</h3>
                {looseAssets.map((texture) => (
                  <label
                    key={texture.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <UiCheckbox
                      checked={selectedLooseAssets.has(texture.id)}
                      onCheckedChange={(value) =>
                        toggle(
                          setSelectedLooseAssets,
                          texture.id,
                          Boolean(value),
                        )
                      }
                    />
                    {texture.name || texture.fileName || texture.id}
                  </label>
                ))}
              </section>
            )}

            {otherPackages.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Layers3 className="h-4 w-4" /> Merge complete packages
                </h3>
                {otherPackages.map((sprite) => (
                  <label
                    key={sprite.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <UiCheckbox
                      checked={selectedPackages.has(sprite.id)}
                      onCheckedChange={(value) =>
                        toggle(
                          setSelectedPackages,
                          sprite.id,
                          Boolean(value),
                        )
                      }
                    />
                    {sprite.name} ({sprite.parts.length} parts)
                  </label>
                ))}
              </section>
            )}
          </div>
        </ScrollArea>

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <UiDialogFooter>
          <UiButton variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </UiButton>
          <UiButton
            disabled={busy || !target || !name.trim()}
            onClick={() => void handleGenerate()}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Regenerate package
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  );
}
