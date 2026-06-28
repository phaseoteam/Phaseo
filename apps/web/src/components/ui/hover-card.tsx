"use client"

import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card"

import { cn } from "@/lib/utils"
import { renderAsChild } from "@/components/ui/base-ui-compat"

function HoverCard({
  openDelay: _openDelay,
  closeDelay: _closeDelay,
  ...props
}: PreviewCardPrimitive.Root.Props & {
  openDelay?: number
  closeDelay?: number
}) {
  return <PreviewCardPrimitive.Root data-slot="hover-card" {...props} />
}

function HoverCardTrigger({
  asChild,
  children,
  ...props
}: PreviewCardPrimitive.Trigger.Props & {
  asChild?: boolean
}) {
  return (
    <PreviewCardPrimitive.Trigger
      data-slot="hover-card-trigger"
      render={renderAsChild(asChild, children)}
      {...props}
    >
      {asChild ? null : children}
    </PreviewCardPrimitive.Trigger>
  )
}

function HoverCardContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 4,
  ...props
}: PreviewCardPrimitive.Popup.Props &
  Pick<
    PreviewCardPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <PreviewCardPrimitive.Portal data-slot="hover-card-portal">
      <PreviewCardPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            "z-50 w-64 origin-(--transform-origin) rounded-lg bg-oklch(1 0 0) p-2.5 text-sm text-oklch(0.145 0 0) shadow-md ring-1 ring-oklch(0.145 0 0)/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:bg-oklch(0.205 0 0) dark:text-oklch(0.985 0 0) dark:ring-oklch(0.985 0 0)/10",
            className
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
