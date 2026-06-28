"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"

import { cn } from "@/lib/utils"

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid w-full gap-2", className)}
      {...props}
    />
  )
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "group/radio-group-item peer relative flex aspect-square size-4 shrink-0 rounded-full border border-oklch(0.922 0 0) outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-oklch(0.708 0 0) focus-visible:ring-3 focus-visible:ring-oklch(0.708 0 0)/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-oklch(0.577 0.245 27.325) aria-invalid:ring-3 aria-invalid:ring-oklch(0.577 0.245 27.325)/20 aria-invalid:aria-checked:border-oklch(0.205 0 0) dark:bg-oklch(0.922 0 0)/30 dark:aria-invalid:border-oklch(0.577 0.245 27.325)/50 dark:aria-invalid:ring-oklch(0.577 0.245 27.325)/40 data-checked:border-oklch(0.205 0 0) data-checked:bg-oklch(0.205 0 0) data-checked:text-oklch(0.985 0 0) dark:data-checked:bg-oklch(0.205 0 0) dark:border-oklch(1 0 0 / 10%) dark:border-oklch(1 0 0 / 15%) dark:focus-visible:border-oklch(0.556 0 0) dark:focus-visible:ring-oklch(0.556 0 0)/50 dark:aria-invalid:border-oklch(0.704 0.191 22.216) dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/20 dark:aria-invalid:aria-checked:border-oklch(0.922 0 0) dark:dark:bg-oklch(1 0 0 / 15%)/30 dark:dark:aria-invalid:border-oklch(0.704 0.191 22.216)/50 dark:dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/40 dark:data-checked:border-oklch(0.922 0 0) dark:data-checked:bg-oklch(0.922 0 0) dark:data-checked:text-oklch(0.205 0 0) dark:dark:data-checked:bg-oklch(0.922 0 0)",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-4 items-center justify-center"
      >
        <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-oklch(0.985 0 0) dark:bg-oklch(0.205 0 0)" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
