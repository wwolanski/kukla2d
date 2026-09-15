import { Copy, Clipboard, Trash2 } from "lucide-react";
import { useState } from "react";

import { CurveIcon } from "@/features/timeline/components/CurveIcon.jsx";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu.jsx";

export function KeyframeContextMenu({
  clipboard,
  onCopy,
  onPaste,
  onSetEasing,
  onRemove,
  children,
}) {
  const [open, setOpen] = useState(false);

  return (
    <ContextMenu open={open} onOpenChange={setOpen}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      {open && (
        <ContextMenuContent>
          <ContextMenuItem onSelect={onCopy}>
            <Copy className="w-3 h-3 mr-2 opacity-70" />
            Copy
          </ContextMenuItem>
          <ContextMenuItem disabled={!clipboard} onSelect={onPaste}>
            <Clipboard className="w-3 h-3 mr-2 opacity-70" />
            Paste
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onSetEasing("linear")}>
            <CurveIcon type="linear" className="mr-2 opacity-70" />
            Linear
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onSetEasing("ease-both")}>
            <CurveIcon type="ease-both" className="mr-2 opacity-70" />
            Ease Both
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onSetEasing("ease-in")}>
            <CurveIcon type="ease-in" className="mr-2 opacity-70" />
            Ease In
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onSetEasing("ease-out")}>
            <CurveIcon type="ease-out" className="mr-2 opacity-70" />
            Ease Out
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onSetEasing("stepped")}>
            <CurveIcon type="stepped" className="mr-2 opacity-70" />
            Stepped
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem className="text-destructive" onSelect={onRemove}>
            <Trash2 className="w-3 h-3 mr-2 opacity-70" />
            Remove
          </ContextMenuItem>
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}
