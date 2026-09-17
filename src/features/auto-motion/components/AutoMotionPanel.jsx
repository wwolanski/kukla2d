import { Plus, Wand2 } from "lucide-react";
import { useState } from "react";

import { useAnimationStore } from "@/store/animationStore.js";
import { useEditorStore } from "@/store/editorStore.js";
import { useProjectStore } from "@/store/projectStore.js";

import { AddMotionWizard } from "@/features/auto-motion/components/AddMotionWizard.jsx";
import { MotionModifierCard } from "@/features/auto-motion/components/MotionModifierCard.jsx";

import { Button } from "@/components/ui/button.jsx";
import { HelpIcon } from "@/components/ui/help-icon.jsx";
import { ScrollArea } from "@/components/ui/scroll-area.js";

export function AutoMotionPanel() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const modifiers = useProjectStore((s) => s.project.animationModifiers ?? []);
  const nodes = useProjectStore((s) => s.project.nodes);
  const selection = useEditorStore((s) => s.selection);
  const activeAnimationId = useAnimationStore((s) => s.activeAnimationId);

  const selectedPart =
    selection.length === 1
      ? nodes.find((n) => n.id === selection[0] && n.type === "part")
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-3 py-2 border-b shrink-0 flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Auto Motion
          </h2>
          <HelpIcon
            tip="Add procedural motion presets like breathing to your character."
            side="left"
          />
        </div>
        {modifiers.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            featureDisabled
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="min-h-full">
          {wizardOpen ? (
            <AddMotionWizard
              open={wizardOpen}
              onClose={() => setWizardOpen(false)}
            />
          ) : modifiers.length === 0 ? (
            <div className="px-3 py-4 space-y-3">
              <div className="rounded border bg-muted/20 px-3 py-3">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium">Idle Breathing</span>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                  Create procedural breathing, map the chest role, then save it
                  as a live modifier.
                </p>
              </div>
              <div className="rounded border bg-muted/20 px-3 py-3">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium">Head Cheek Jiggle</span>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                  Subtle cheek jiggle driven by head bone motion. Requires a
                  head bone and a face part with mesh.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs gap-1"
                featureDisabled
              >
                <Plus className="h-3 w-3" />
                Add Motion
              </Button>
              {selectedPart ? (
                <p className="text-[10px] text-muted-foreground">
                  Selected layer:{" "}
                  <span className="font-medium text-foreground">
                    {selectedPart.name}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Select a part or use canvas picking during role mapping.
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y">
              <div className="px-3 py-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-full text-xs gap-1"
                  featureDisabled
                >
                  <Plus className="h-3 w-3" />
                  Add Motion
                </Button>
              </div>
              {modifiers.map((mod) => (
                <MotionModifierCard
                  key={mod.id}
                  modifier={mod}
                  activeAnimationId={activeAnimationId}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
