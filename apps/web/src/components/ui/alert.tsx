import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border border-oklch(0.922 0 0) px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4 dark:border-oklch(1 0 0 / 10%)",
  {
    variants: {
      variant: {
        default: "bg-oklch(1 0 0) text-oklch(0.145 0 0) dark:bg-oklch(0.205 0 0) dark:text-oklch(0.985 0 0)",
        destructive:
          "bg-oklch(1 0 0) text-oklch(0.577 0.245 27.325) *:data-[slot=alert-description]:text-oklch(0.577 0.245 27.325)/90 *:[svg]:text-current dark:bg-oklch(0.205 0 0) dark:text-oklch(0.704 0.191 22.216) dark:*:data-[slot=alert-description]:text-oklch(0.704 0.191 22.216)/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-oklch(0.145 0 0) dark:[&_a]:hover:text-oklch(0.985 0 0)",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-balance text-oklch(0.556 0 0) md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-oklch(0.145 0 0) [&_p:not(:last-child)]:mb-4 dark:text-oklch(0.708 0 0) dark:[&_a]:hover:text-oklch(0.985 0 0)",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-2 right-2", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
