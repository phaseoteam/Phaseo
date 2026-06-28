import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-oklch(0.922 0 0) bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-oklch(0.556 0 0) focus-visible:border-oklch(0.708 0 0) focus-visible:ring-3 focus-visible:ring-oklch(0.708 0 0)/50 disabled:cursor-not-allowed disabled:bg-oklch(0.922 0 0)/50 disabled:opacity-50 aria-invalid:border-oklch(0.577 0.245 27.325) aria-invalid:ring-3 aria-invalid:ring-oklch(0.577 0.245 27.325)/20 md:text-sm dark:bg-oklch(0.922 0 0)/30 dark:disabled:bg-oklch(0.922 0 0)/80 dark:aria-invalid:border-oklch(0.577 0.245 27.325)/50 dark:aria-invalid:ring-oklch(0.577 0.245 27.325)/40 dark:border-oklch(1 0 0 / 10%) dark:border-oklch(1 0 0 / 15%) dark:placeholder:text-oklch(0.708 0 0) dark:focus-visible:border-oklch(0.556 0 0) dark:focus-visible:ring-oklch(0.556 0 0)/50 dark:disabled:bg-oklch(1 0 0 / 15%)/50 dark:aria-invalid:border-oklch(0.704 0.191 22.216) dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/20 dark:dark:bg-oklch(1 0 0 / 15%)/30 dark:dark:disabled:bg-oklch(1 0 0 / 15%)/80 dark:dark:aria-invalid:border-oklch(0.704 0.191 22.216)/50 dark:dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
