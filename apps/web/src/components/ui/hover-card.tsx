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

// Composition helpers. Every card follows one layout, top to bottom: a header
// (icon plus a truncated title), a muted meta line, one big number when there
// is one, label/value rows, then notes, links or badges. Give the content
// `space-y-2.5` so the blocks sit evenly; nothing inside a card is boxed.

/** Joins the parts that are set with " · ". */
function joinHoverCardMeta(parts: ReadonlyArray<React.ReactNode>): React.ReactNode[] {
  const present = parts.filter(
    (part) => part !== null && part !== undefined && part !== false && part !== ""
  )
  return present.map((part, index) => (
    <React.Fragment key={index}>
      {index > 0 ? " · " : null}
      {part}
    </React.Fragment>
  ))
}

function HoverCardMeta({
  className,
  items,
  children,
  ...props
}: React.ComponentProps<"p"> & { items?: ReadonlyArray<React.ReactNode> }) {
  const content = items ? joinHoverCardMeta(items) : children
  if (items && (content as React.ReactNode[]).length === 0) return null
  return (
    <p
      data-slot="hover-card-meta"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    >
      {content}
    </p>
  )
}

function HoverCardHeader({
  icon,
  title,
  meta,
  className,
  titleClassName,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  /** Parts of the meta line under the title; empty parts are skipped. */
  meta?: ReadonlyArray<React.ReactNode>
  className?: string
  titleClassName?: string
}) {
  return (
    <div data-slot="hover-card-header" className={className}>
      <div className="flex min-w-0 items-center gap-2 font-medium text-foreground">
        {icon ? <span className="flex shrink-0 items-center [&_svg]:size-3.5">{icon}</span> : null}
        <span className={cn("min-w-0 truncate", titleClassName)}>{title}</span>
      </div>
      {meta ? <HoverCardMeta items={meta} className="mt-0.5" /> : null}
    </div>
  )
}

/** The card's one headline number. */
function HoverCardStat({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="hover-card-stat"
      className={cn("text-lg font-semibold leading-tight tabular-nums text-foreground", className)}
      {...props}
    />
  )
}

export type HoverCardRow = {
  label: React.ReactNode
  value: React.ReactNode
  key?: string
  valueClassName?: string
}

/** Label/value rows; a row whose value is null or undefined is left out. */
function HoverCardRows({
  rows,
  className,
}: {
  rows: ReadonlyArray<HoverCardRow | null | false | undefined>
  className?: string
}) {
  const present = rows.filter(
    (row): row is HoverCardRow => Boolean(row) && (row as HoverCardRow).value !== null && (row as HoverCardRow).value !== undefined
  )
  if (present.length === 0) return null
  return (
    <dl
      data-slot="hover-card-rows"
      className={cn("grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 text-xs", className)}
    >
      {present.map((row, index) => (
        <React.Fragment key={row.key ?? (typeof row.label === "string" ? row.label : index)}>
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className={cn("min-w-0 text-right text-foreground tabular-nums", row.valueClassName)}>{row.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

/** A short muted sentence under the rows. */
function HoverCardNote({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="hover-card-note"
      className={cn("text-xs leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  )
}

/** Links on one line, joined with " · ", like "Policy · Privacy · Terms". */
function HoverCardLinks({ className, children }: { className?: string; children: React.ReactNode }) {
  const links = React.Children.toArray(children)
  if (links.length === 0) return null
  return (
    <p
      data-slot="hover-card-links"
      className={cn(
        "text-xs text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:decoration-border [&_a]:underline-offset-2 [&_a:hover]:decoration-current",
        className
      )}
    >
      {joinHoverCardMeta(links)}
    </p>
  )
}

// Card body helpers for richer cards (usage, credits, keys, entity cards).
// Same layout: a title row with the meta line, an optional headline figure or
// row of stat tiles, left-aligned label/value facts, then badges.

export type HoverCardFact = {
  /** Defaults to the label when the label is a string. */
  key?: string
  label: React.ReactNode
  value: React.ReactNode
}

/** Joins the parts that are present with " · "; null when none are. */
function joinMeta(parts: ReadonlyArray<React.ReactNode>): React.ReactNode {
  const joined = joinHoverCardMeta(parts)
  return joined.length === 0 ? null : joined
}

/** Title row with an optional icon or logo, then the meta line ("a · b"). */
function HoverCardTitle({
  icon,
  title,
  meta,
  className,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  meta?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex min-w-0 items-center gap-2 font-medium text-foreground">
        {icon ? <span className="flex shrink-0 items-center">{icon}</span> : null}
        <span className="min-w-0 truncate">{title}</span>
      </div>
      {meta ? <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div> : null}
    </div>
  )
}

/** One big figure, such as a balance or a duration, with optional muted words before or after it. */
function HoverCardHeadline({
  children,
  prefix,
  label,
  className,
}: {
  children: React.ReactNode
  prefix?: React.ReactNode
  label?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 items-baseline gap-2", className)}>
      {prefix ? <span className="shrink-0 text-xs text-muted-foreground">{prefix}</span> : null}
      <span className="text-lg font-semibold tabular-nums text-foreground">{children}</span>
      {label ? <span className="truncate text-xs text-muted-foreground">{label}</span> : null}
    </div>
  )
}

export type HoverCardStatTile = {
  /** Defaults to the label when the label is a string. */
  key?: string
  label: React.ReactNode
  value: React.ReactNode
}

/** Up to four small figures in a row, each with a sentence-case label under it. */
function HoverCardStats({
  items,
  className,
}: {
  items: ReadonlyArray<HoverCardStatTile | null | false | undefined>
  className?: string
}) {
  const present = items.filter((item): item is HoverCardStatTile => Boolean(item)).slice(0, 4)
  if (present.length === 0) return null
  return (
    <dl
      data-slot="hover-card-stats"
      className={cn("grid gap-px overflow-hidden rounded-md bg-border", className)}
      style={{ gridTemplateColumns: `repeat(${present.length}, minmax(0, 1fr))` }}
    >
      {present.map((item, index) => (
        <div
          key={item.key ?? (typeof item.label === "string" ? item.label : index)}
          className="flex min-w-0 flex-col-reverse bg-secondary px-1 py-1.5 text-center"
        >
          <dt className="truncate text-[11px] text-muted-foreground">{item.label}</dt>
          <dd className="truncate text-sm font-semibold tabular-nums text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Label/value rows; values are left-aligned and wrap rather than overflow. */
function HoverCardFacts({
  rows,
  className,
}: {
  rows: ReadonlyArray<HoverCardFact | null | false | undefined>
  className?: string
}) {
  const present = rows.filter((row): row is HoverCardFact => Boolean(row))
  if (present.length === 0) return null
  return (
    <dl className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs", className)}>
      {present.map((row, index) => (
        <React.Fragment key={row.key ?? (typeof row.label === "string" ? row.label : index)}>
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 break-words text-foreground">{row.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

/** A wrapping row of badges at the foot of a card. */
function HoverCardBadgeRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn("flex flex-wrap gap-1.5", className)}>{children}</div>
}

/** The card body: stacks the parts above with even spacing. */
function HoverCardBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn("grid min-w-0 gap-2.5 text-sm", className)}>{children}</div>
}

export {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
  HoverCardHeader,
  HoverCardMeta,
  HoverCardStat,
  HoverCardRows,
  HoverCardNote,
  HoverCardLinks,
  HoverCardTitle,
  HoverCardHeadline,
  HoverCardStats,
  HoverCardFacts,
  HoverCardBadgeRow,
  HoverCardBody,
  joinMeta,
}
