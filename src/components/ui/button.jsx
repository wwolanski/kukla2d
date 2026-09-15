import { Slot } from "@radix-ui/react-slot";
import * as React from "react";

import { cn } from "@/lib/utils.js";

import { buttonVariants } from "@/components/ui/button-variants.js";
import { FeatureDisabledTooltip } from "@/components/ui/feature-disabled-tooltip.jsx";

const Button = React.forwardRef(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      featureDisabled = false,
      onClick,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const buttonElement = (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          featureDisabled && "opacity-50",
        )}
        ref={ref}
        disabled={featureDisabled ? false : props.disabled}
        onClick={featureDisabled ? undefined : onClick}
        {...props}
      />
    );

    if (featureDisabled) {
      return <FeatureDisabledTooltip>{buttonElement}</FeatureDisabledTooltip>;
    }

    return buttonElement;
  },
);
Button.displayName = "Button";

export { Button };
