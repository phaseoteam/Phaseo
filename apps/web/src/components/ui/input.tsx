import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-oklch(0.922 0 0) bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-oklch(0.145 0 0) placeholder:text-oklch(0.556 0 0) focus-visible:border-oklch(0.708 0 0) focus-visible:ring-3 focus-visible:ring-oklch(0.708 0 0)/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-oklch(0.922 0 0)/50 disabled:opacity-50 aria-invalid:border-oklch(0.577 0.245 27.325) aria-invalid:ring-3 aria-invalid:ring-oklch(0.577 0.245 27.325)/20 md:text-sm dark:bg-oklch(0.922 0 0)/30 dark:disabled:bg-oklch(0.922 0 0)/80 dark:aria-invalid:border-oklch(0.577 0.245 27.325)/50 dark:aria-invalid:ring-oklch(0.577 0.245 27.325)/40 dark:border-oklch(1 0 0 / 10%) dark:border-oklch(1 0 0 / 15%) dark:file:text-oklch(0.985 0 0) dark:placeholder:text-oklch(0.708 0 0) dark:focus-visible:border-oklch(0.556 0 0) dark:focus-visible:ring-oklch(0.556 0 0)/50 dark:disabled:bg-oklch(1 0 0 / 15%)/50 dark:aria-invalid:border-oklch(0.704 0.191 22.216) dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/20 dark:dark:bg-oklch(1 0 0 / 15%)/30 dark:dark:disabled:bg-oklch(1 0 0 / 15%)/80 dark:dark:aria-invalid:border-oklch(0.704 0.191 22.216)/50 dark:dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
