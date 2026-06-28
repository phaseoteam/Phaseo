"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-oklch(0.556 0 0) group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none dark:text-oklch(0.708 0 0)",
  {
    variants: {
      variant: {
        default: "bg-oklch(0.97 0 0) dark:bg-oklch(0.269 0 0)",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-oklch(0.922 0 0) border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-oklch(0.145 0 0)/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-oklch(0.145 0 0) focus-visible:border-oklch(0.708 0 0) focus-visible:ring-[3px] focus-visible:ring-oklch(0.708 0 0)/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-oklch(0.556 0 0) dark:hover:text-oklch(0.145 0 0) group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 dark:border-oklch(1 0 0 / 10%) dark:text-oklch(0.985 0 0)/60 dark:hover:text-oklch(0.985 0 0) dark:focus-visible:border-oklch(0.556 0 0) dark:focus-visible:ring-oklch(0.556 0 0)/50 dark:dark:text-oklch(0.708 0 0) dark:dark:hover:text-oklch(0.985 0 0)",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-oklch(1 0 0) data-active:text-oklch(0.145 0 0) dark:data-active:border-oklch(0.922 0 0) dark:data-active:bg-oklch(0.922 0 0)/30 dark:data-active:text-oklch(0.145 0 0) dark:data-active:bg-oklch(0.145 0 0) dark:data-active:text-oklch(0.985 0 0) dark:dark:data-active:border-oklch(1 0 0 / 15%) dark:dark:data-active:bg-oklch(1 0 0 / 15%)/30 dark:dark:data-active:text-oklch(0.985 0 0)",
        "after:absolute after:bg-oklch(0.145 0 0) after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100 dark:after:bg-oklch(0.985 0 0)",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
