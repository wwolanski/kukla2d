import * as TogglePrimitive from "@radix-ui/react-toggle";
import * as React from "react";

import { cn } from "@/lib/utils.js";

import { toggleVariants } from "@/components/ui/toggle-variants.js";

const Toggle = React.forwardRef(
  ({ className, variant, size, ...props }, ref) => (
    <TogglePrimitive.Root
      ref={ref}
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  ),
);

Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle };
