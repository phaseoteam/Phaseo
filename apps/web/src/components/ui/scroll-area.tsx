"use client"

import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"

import { cn } from "@/lib/utils"

function ScrollArea({
  className,
  viewportClassName,
  scrollBarOrientation = "vertical",
  type,
  children,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  viewportClassName?: string
  scrollBarOrientation?: "both" | "horizontal" | "vertical"
  type?: string
}) {
  void type
  const showHorizontal =
    scrollBarOrientation === "horizontal" || scrollBarOrientation === "both"
  const showVertical =
    scrollBarOrientation === "vertical" || scrollBarOrientation === "both"

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-oklch(0.708 0 0)/50 focus-visible:outline-1 dark:focus-visible:ring-oklch(0.556 0 0)/50",
          viewportClassName
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {showVertical ? <ScrollBar orientation="vertical" /> : null}
      {showHorizontal ? <ScrollBar orientation="horizontal" /> : null}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-oklch(0.922 0 0) dark:bg-oklch(1 0 0 / 10%)"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }
