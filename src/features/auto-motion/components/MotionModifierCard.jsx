import { Trash2, Flame } from "lucide-react";
import { useState } from "react";

import { useProjectStore } from "@/store/projectStore";

import { HeadCheekJiggleControls } from "@/features/auto-motion/components/HeadCheekJiggleControls.jsx";
import { IdleBreathingControls } from "@/features/auto-motion/components/IdleBreathingControls.jsx";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function MotionModifierCard({ modifier, activeAnimationId }) {
  const updateAnimationModifier = useProjectStore(
    (s) => s.updateAnimationModifier,
  );
  const deleteAnimationModifier = useProjectStore(
    (s) => s.deleteAnimationModifier,
  );
  const bakeAnimationModifierToKeyframes = useProjectStore(
    (s) => s.bakeAnimationModifierToKeyframes,
  );
  const [bakeOpen, setBakeOpen] = useState(false);
  const [bakeMode, setBakeMode] = useState("disable-after-bake");
  const [bakeStatus, setBakeStatus] = useState(null);
  const hasActiveClip = !!activeAnimationId;

  const handleBake = () => {
    setBakeStatus(null);
    const result = bakeAnimationModifierToKeyframes({
      modifierId: modifier.id,
      animationId: activeAnimationId,
      mode: bakeMode,
    });
    if (result.error) {
      setBakeStatus({ type: "error", message: result.error });
    } else {
      setBakeStatus({
        type: "success",
        message: `${result.count} keyframes created`,
      });
      setTimeout(() => {
        setBakeOpen(false);
        setBakeStatus(null);
      }, 1500);
    }
  };

  const handleEnabledChange = (checked) => {
    updateAnimationModifier(modifier.id, { enabled: checked });
  };

  const handleScopeChange = (scope) => {
    updateAnimationModifier(modifier.id, {
      scope,
      clipId: scope === "clip" ? activeAnimationId : null,
    });
  };

  const handleDelete = () => {
    deleteAnimationModifier(modifier.id);
  };

  return (
    <div className="px-3 py-2 space-y-2">
      <div className="flex items-center gap-2">
        <Checkbox
          checked={modifier.enabled}
          onCheckedChange={handleEnabledChange}
          className="h-3.5 w-3.5"
        />
        <span className="text-xs font-medium flex-1 truncate">
          {modifier.name}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          {modifier.category === "reaction" ? "Reaction" : "Loop"}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          {modifier.scope === "project" ? "All clips" : "This clip"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 shrink-0 opacity-60 hover:opacity-100"
          title="Delete modifier"
          onClick={handleDelete}
        >
          <Trash2 className="h-2.5 w-2.5" />
        </Button>
      </div>

      {modifier.presetId === "builtin.idleBreathing" && (
        <IdleBreathingControls
          modifier={modifier}
          updateAnimationModifier={updateAnimationModifier}
        />
      )}
      {modifier.presetId === "builtin.headCheekJiggle" && (
        <HeadCheekJiggleControls
          modifier={modifier}
          updateAnimationModifier={updateAnimationModifier}
        />
      )}

      <div className="pt-1">
        {!bakeOpen ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-6 text-[10px] gap-1"
                  disabled={!hasActiveClip || modifier.category === "reaction"}
                  onClick={() => setBakeOpen(true)}
                  title={
                    !hasActiveClip
                      ? "Select an animation clip to bake"
                      : modifier.category === "reaction"
                        ? "Baking is not supported for reaction-driven modifiers"
                        : "Bake modifier to keyframes"
                  }
                >
                  <Flame className="h-2.5 w-2.5" />
                  Bake to Keyframes
                </Button>
              </span>
            </TooltipTrigger>
            {modifier.category === "reaction" && (
              <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                Reaction-driven modifiers cannot be baked to keyframes
              </TooltipContent>
            )}
          </Tooltip>
        ) : (
          <div className="rounded border px-2 py-1.5 space-y-1.5">
            <span className="text-[10px] font-medium">Bake to Keyframes</span>
            <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
              <input
                type="radio"
                name="bakeMode"
                checked={bakeMode === "disable-after-bake"}
                onChange={() => setBakeMode("disable-after-bake")}
                className="h-2.5 w-2.5"
              />
              <span>Disable live motion after bake</span>
            </label>
            <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
              <input
                type="radio"
                name="bakeMode"
                checked={bakeMode === "keep-live"}
                onChange={() => setBakeMode("keep-live")}
                className="h-2.5 w-2.5"
              />
              <span>Keep live motion enabled</span>
            </label>
            {bakeStatus && (
              <span
                className={`text-[9px] block ${bakeStatus.type === "error" ? "text-destructive" : "text-green-500"}`}
              >
                {bakeStatus.message}
              </span>
            )}
            <div className="flex gap-1">
              <Button
                variant="default"
                size="sm"
                className="h-5 text-[10px] px-2 flex-1"
                onClick={handleBake}
              >
                Bake
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] px-2"
                onClick={() => {
                  setBakeOpen(false);
                  setBakeStatus(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-[10px] text-muted-foreground w-12 shrink-0 cursor-default underline decoration-dotted decoration-muted-foreground/30 underline-offset-2">
              Scope
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[11px] max-w-[180px]">
            Whether the modifier affects all clips or only the active one.
          </TooltipContent>
        </Tooltip>
        <Select value={modifier.scope} onValueChange={handleScopeChange}>
          <SelectTrigger className="h-6 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="project" className="text-xs">
              All clips
            </SelectItem>
            <SelectItem
              value="clip"
              className="text-xs"
              disabled={!activeAnimationId}
            >
              This clip
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
