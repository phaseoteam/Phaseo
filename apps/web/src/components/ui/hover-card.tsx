"use client"

import * as React from "react"
import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card"

import { cn } from "@/lib/utils"
import { renderAsChild } from "@/components/ui/base-ui-compat"

// Opens or closes an uncontrolled card. Touch screens cannot hover, so a tap
// on the trigger toggles the card like a popover; a tap elsewhere closes it.
const HoverCardTapContext = React.createContext<(() => void) | null>(null)

function HoverCard({
  openDelay,
  closeDelay,
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: PreviewCardPrimitive.Root.Props & {
  openDelay?: number
  closeDelay?: number
}) {
  void openDelay
  void closeDelay
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false)
  // Controlled cards decide for themselves what a click does.
  const controlled = open !== undefined
  const toggle = React.useCallback(() => setUncontrolledOpen((current) => !current), [])
  return (
    <HoverCardTapContext.Provider value={controlled ? null : toggle}>
      <PreviewCardPrimitive.Root
        data-slot="hover-card"
        open={controlled ? open : uncontrolledOpen}
        onOpenChange={(nextOpen, details) => {
          if (!controlled) setUncontrolledOpen(nextOpen)
          onOpenChange?.(nextOpen, details)
        }}
        {...props}
      />
    </HoverCardTapContext.Provider>
  )
}

function HoverCardTrigger({
  asChild,
  children,
  onPointerDown,
  onClick,
  ...props
}: PreviewCardPrimitive.Trigger.Props & {
  asChild?: boolean
}) {
  const toggle = React.useContext(HoverCardTapContext)
  const pointerType = React.useRef("")
  const tapProps = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      pointerType.current = event.pointerType
      onPointerDown?.(event as never)
    },
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      onClick?.(event as never)
      // A tapped link still navigates; anything else opens its card instead
      // of following a surrounding link or row.
      const isLink = event.currentTarget instanceof HTMLAnchorElement && event.currentTarget.href
      if (toggle && !event.defaultPrevented && !isLink && (pointerType.current === "touch" || pointerType.current === "pen")) {
        event.preventDefault()
        toggle()
      }
      pointerType.current = ""
    },
  }

  if (asChild) {
    return (
      <PreviewCardPrimitive.Trigger
        data-slot="hover-card-trigger"
        render={renderAsChild(asChild, children)}
        {...props}
        {...tapProps}
      />
    )
  }

  return (
    <PreviewCardPrimitive.Trigger
      data-slot="hover-card-trigger"
      render={renderAsChild(asChild, children)}
      {...props}
      {...tapProps}
    >
      {children}
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
		className="isolate z-[100]"
      >
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            "z-50 w-72 origin-(--transform-origin) rounded-3xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
