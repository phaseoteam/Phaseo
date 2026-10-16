import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Check, Minus } from "lucide-react"

import { cn } from "../../lib/utils"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "relative inline-flex size-3.5 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-input bg-background outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground data-[disabled]:cursor-default data-[disabled]:opacity-60 data-[indeterminate]:text-foreground dark:bg-input/30",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center data-[unchecked]:hidden"
        render={(indicatorProps, state) => <span {...indicatorProps}>{state.indeterminate ? <Minus aria-hidden className="size-2.5 [stroke-width:3]" /> : <Check aria-hidden className="size-2.5 [stroke-width:3]" />}</span>}
      />
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
