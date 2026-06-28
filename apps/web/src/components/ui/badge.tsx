import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-oklch(0.922 0 0) border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-oklch(0.708 0 0) focus-visible:ring-[3px] focus-visible:ring-oklch(0.708 0 0)/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-oklch(0.577 0.245 27.325) aria-invalid:ring-oklch(0.577 0.245 27.325)/20 dark:aria-invalid:ring-oklch(0.577 0.245 27.325)/40 [&>svg]:pointer-events-none [&>svg]:size-3! dark:border-oklch(1 0 0 / 10%) dark:focus-visible:border-oklch(0.556 0 0) dark:focus-visible:ring-oklch(0.556 0 0)/50 dark:aria-invalid:border-oklch(0.704 0.191 22.216) dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/20 dark:dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/40",
  {
    variants: {
      variant: {
        default: "bg-oklch(0.205 0 0) text-oklch(0.985 0 0) [a]:hover:bg-oklch(0.205 0 0)/80 dark:bg-oklch(0.922 0 0) dark:text-oklch(0.205 0 0) dark:[a]:hover:bg-oklch(0.922 0 0)/80",
        secondary:
          "bg-oklch(0.97 0 0) text-oklch(0.205 0 0) [a]:hover:bg-oklch(0.97 0 0)/80 dark:bg-oklch(0.269 0 0) dark:text-oklch(0.985 0 0) dark:[a]:hover:bg-oklch(0.269 0 0)/80",
        destructive:
          "bg-oklch(0.577 0.245 27.325)/10 text-oklch(0.577 0.245 27.325) focus-visible:ring-oklch(0.577 0.245 27.325)/20 dark:bg-oklch(0.577 0.245 27.325)/20 dark:focus-visible:ring-oklch(0.577 0.245 27.325)/40 [a]:hover:bg-oklch(0.577 0.245 27.325)/20 dark:bg-oklch(0.704 0.191 22.216)/10 dark:text-oklch(0.704 0.191 22.216) dark:focus-visible:ring-oklch(0.704 0.191 22.216)/20 dark:dark:bg-oklch(0.704 0.191 22.216)/20 dark:dark:focus-visible:ring-oklch(0.704 0.191 22.216)/40 dark:[a]:hover:bg-oklch(0.704 0.191 22.216)/20",
        outline:
          "border-oklch(0.922 0 0) text-oklch(0.145 0 0) [a]:hover:bg-oklch(0.97 0 0) [a]:hover:text-oklch(0.556 0 0) dark:border-oklch(1 0 0 / 10%) dark:text-oklch(0.985 0 0) dark:[a]:hover:bg-oklch(0.269 0 0) dark:[a]:hover:text-oklch(0.708 0 0)",
        ghost:
          "hover:bg-oklch(0.97 0 0) hover:text-oklch(0.556 0 0) dark:hover:bg-oklch(0.97 0 0)/50 dark:hover:bg-oklch(0.269 0 0) dark:hover:text-oklch(0.708 0 0) dark:dark:hover:bg-oklch(0.269 0 0)/50",
        link: "text-oklch(0.205 0 0) underline-offset-4 hover:underline dark:text-oklch(0.922 0 0)",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
