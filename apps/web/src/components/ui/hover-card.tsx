import * as React from "react"
import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card"

import { cn } from "@/lib/utils"
import { renderAsChild } from "@/components/ui/base-ui-compat"

// Base UI reads delays only on the trigger and defaults to 600 ms open and
// 300 ms close, which feels sluggish for inline hints.
const DEFAULT_OPEN_DELAY = 150
const DEFAULT_CLOSE_DELAY = 100

type HoverCardContextValue = {
  // Opens or closes an uncontrolled card. Touch screens cannot hover, so a tap
  // on the trigger toggles the card like a popover; a tap elsewhere closes it.
  // Null for controlled cards, which decide for themselves what a click does.
  toggle: (() => void) | null
  openDelay?: number
  closeDelay?: number
}

const HoverCardContext = React.createContext<HoverCardContextValue>({ toggle: null })

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
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false)
  const controlled = open !== undefined
  const toggle = React.useCallback(() => setUncontrolledOpen((current) => !current), [])
  const context = React.useMemo(
    () => ({ toggle: controlled ? null : toggle, openDelay, closeDelay }),
    [controlled, toggle, openDelay, closeDelay]
  )
  return (
    <HoverCardContext.Provider value={context}>
      <PreviewCardPrimitive.Root
        data-slot="hover-card"
        open={controlled ? open : uncontrolledOpen}
        onOpenChange={(nextOpen, details) => {
          if (!controlled) setUncontrolledOpen(nextOpen)
          onOpenChange?.(nextOpen, details)
        }}
        {...props}
      />
    </HoverCardContext.Provider>
  )
}

function HoverCardTrigger({
  asChild,
  children,
  onPointerDown,
  onClick,
  delay,
  closeDelay,
  openOnTap = true,
  ...props
}: PreviewCardPrimitive.Trigger.Props & {
  asChild?: boolean
  // Set false when the trigger has its own tap action, such as a sort
  // button; the card then shows only on hover and focus.
  openOnTap?: boolean
}) {
  const context = React.useContext(HoverCardContext)
  const toggle = openOnTap ? context.toggle : null
  const pointerType = React.useRef("")
  const delayProps = {
    delay: delay ?? context.openDelay ?? DEFAULT_OPEN_DELAY,
    closeDelay: closeDelay ?? context.closeDelay ?? DEFAULT_CLOSE_DELAY,
  }
  const tapProps = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      pointerType.current = event.pointerType
      onPointerDown?.(event as never)
    },
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      onClick?.(event as never)
      // A tapped link (the trigger itself or one inside it) still navigates;
      // anything else opens its card instead of following a surrounding link
      // or firing a parent row's click handler.
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null
      const isLink = Boolean(link && event.currentTarget.contains(link))
      if (toggle && !event.defaultPrevented && !isLink && (pointerType.current === "touch" || pointerType.current === "pen")) {
        event.preventDefault()
        event.stopPropagation()
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
        {...delayProps}
        {...tapProps}
      />
    )
  }

  return (
    <PreviewCardPrimitive.Trigger
      data-slot="hover-card-trigger"
      render={renderAsChild(asChild, children)}
      {...props}
      {...delayProps}
      {...tapProps}
    >
      {children}
    </PreviewCardPrimitive.Trigger>
  )
}

function HoverCardContent({
  className,
  side = "top",
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
            "z-50 w-72 origin-(--transform-origin) rounded-md bg-popover p-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
