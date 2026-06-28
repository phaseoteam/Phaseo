"use client"

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-lg text-sm font-medium whitespace-nowrap transition-all outline-none hover:bg-oklch(0.97 0 0) hover:text-oklch(0.145 0 0) focus-visible:border-oklch(0.708 0 0) focus-visible:ring-[3px] focus-visible:ring-oklch(0.708 0 0)/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-oklch(0.577 0.245 27.325) aria-invalid:ring-oklch(0.577 0.245 27.325)/20 aria-pressed:bg-oklch(0.97 0 0) data-[state=on]:bg-oklch(0.97 0 0) dark:aria-invalid:ring-oklch(0.577 0.245 27.325)/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 dark:hover:bg-oklch(0.269 0 0) dark:hover:text-oklch(0.985 0 0) dark:focus-visible:border-oklch(0.556 0 0) dark:focus-visible:ring-oklch(0.556 0 0)/50 dark:aria-invalid:border-oklch(0.704 0.191 22.216) dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/20 dark:aria-pressed:bg-oklch(0.269 0 0) dark:data-[state=on]:bg-oklch(0.269 0 0) dark:dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/40",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-oklch(0.922 0 0) bg-transparent hover:bg-oklch(0.97 0 0) dark:border-oklch(1 0 0 / 15%) dark:hover:bg-oklch(0.269 0 0)",
      },
      size: {
        default:
          "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
