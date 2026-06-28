"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-oklch(0.922 0 0) border-transparent transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-oklch(0.708 0 0) focus-visible:ring-3 focus-visible:ring-oklch(0.708 0 0)/50 aria-invalid:border-oklch(0.577 0.245 27.325) aria-invalid:ring-3 aria-invalid:ring-oklch(0.577 0.245 27.325)/20 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] dark:aria-invalid:border-oklch(0.577 0.245 27.325)/50 dark:aria-invalid:ring-oklch(0.577 0.245 27.325)/40 data-checked:bg-oklch(0.205 0 0) data-unchecked:bg-oklch(0.922 0 0) dark:data-unchecked:bg-oklch(0.922 0 0)/80 data-disabled:cursor-not-allowed data-disabled:opacity-50 dark:border-oklch(1 0 0 / 10%) dark:focus-visible:border-oklch(0.556 0 0) dark:focus-visible:ring-oklch(0.556 0 0)/50 dark:aria-invalid:border-oklch(0.704 0.191 22.216) dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/20 dark:dark:aria-invalid:border-oklch(0.704 0.191 22.216)/50 dark:dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/40 dark:data-checked:bg-oklch(0.922 0 0) dark:data-unchecked:bg-oklch(1 0 0 / 15%) dark:dark:data-unchecked:bg-oklch(1 0 0 / 15%)/80",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-oklch(1 0 0) ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] dark:data-checked:bg-oklch(0.985 0 0) group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0 dark:data-unchecked:bg-oklch(0.145 0 0) dark:bg-oklch(0.145 0 0) dark:dark:data-checked:bg-oklch(0.205 0 0) dark:dark:data-unchecked:bg-oklch(0.985 0 0)"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
