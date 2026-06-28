"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-react"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-oklch(0.922 0 0) transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-oklch(0.708 0 0) focus-visible:ring-3 focus-visible:ring-oklch(0.708 0 0)/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-oklch(0.577 0.245 27.325) aria-invalid:ring-3 aria-invalid:ring-oklch(0.577 0.245 27.325)/20 aria-invalid:aria-checked:border-oklch(0.205 0 0) dark:bg-oklch(0.922 0 0)/30 dark:aria-invalid:border-oklch(0.577 0.245 27.325)/50 dark:aria-invalid:ring-oklch(0.577 0.245 27.325)/40 data-checked:border-oklch(0.205 0 0) data-checked:bg-oklch(0.205 0 0) data-checked:text-oklch(0.985 0 0) dark:data-checked:bg-oklch(0.205 0 0) dark:border-oklch(1 0 0 / 10%) dark:border-oklch(1 0 0 / 15%) dark:focus-visible:border-oklch(0.556 0 0) dark:focus-visible:ring-oklch(0.556 0 0)/50 dark:aria-invalid:border-oklch(0.704 0.191 22.216) dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/20 dark:aria-invalid:aria-checked:border-oklch(0.922 0 0) dark:dark:bg-oklch(1 0 0 / 15%)/30 dark:dark:aria-invalid:border-oklch(0.704 0.191 22.216)/50 dark:dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/40 dark:data-checked:border-oklch(0.922 0 0) dark:data-checked:bg-oklch(0.922 0 0) dark:data-checked:text-oklch(0.205 0 0) dark:dark:data-checked:bg-oklch(0.922 0 0)",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
