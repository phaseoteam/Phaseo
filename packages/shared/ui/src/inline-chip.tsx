import type { MouseEvent, ReactNode } from "react"
import { INLINE_CHIP_EMBEDDED, INLINE_CHIP_TONES, type InlineChipAccent, type InlineChipTone } from "@phaseo/app-kit/ui-recipes"

import { cn } from "./cn"

// Web-only sizing: aligned to the bottom of the surrounding text (a flex box would otherwise take its
// baseline from the icon and ride high), sized relative to that text, with a muted, fixed-size icon.
const layout = "mx-px inline-flex max-w-full items-center gap-1 align-text-bottom text-[0.9em] leading-[1.45] [&_img]:size-3.5 [&_svg]:size-3.5 [&_svg]:shrink-0"
// Embedded in a reply: the label keeps the sentence's size and baseline, and the icon centres on it.
const embeddedLayout = "mx-px inline-flex max-w-full items-baseline gap-1 [&_img]:size-3.5 [&_img]:self-center [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:self-center"
const focus = "outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

// Tailwind only generates classes it finds written out, so the recipe's icon colour and pressed fill
// appear here with their variants. app-kit's inline-chip test keeps these in step with the recipe.
const variants: Record<InlineChipTone, { icon: string; hover: string }> = {
  default: { icon: "[&_svg]:text-muted-foreground", hover: "hover:bg-foreground/14" },
  inverse: { icon: "[&_svg]:text-background/70", hover: "hover:bg-background/24" },
}
const embedded = { icon: "[&_svg]:text-muted-foreground", hover: "hover:bg-foreground/11" }

// The recipe's accents (INLINE_CHIP_ACCENTS), written out for the icon.
const accents: Record<InlineChipAccent, string> = {
  open: "[&_svg]:text-emerald-600 dark:[&_svg]:text-emerald-400",
  done: "[&_svg]:text-violet-600 dark:[&_svg]:text-violet-400",
  closed: "[&_svg]:text-red-600 dark:[&_svg]:text-red-400",
  draft: "[&_svg]:text-zinc-500 dark:[&_svg]:text-zinc-400",
  error: "[&_svg]:text-destructive",
}

type InlineChipProps = {
  icon?: ReactNode
  children: ReactNode
  title?: string
  onClick?: (event: MouseEvent<HTMLElement>) => void
  href?: string
  className?: string
  selected?: boolean
  disabled?: boolean
  /** `inverse` for a chip on an inverted surface, such as a `bg-foreground` message bubble. */
  tone?: InlineChipTone
  /** `embedded` sets the chip into a model's reply: body-size text at body weight and a fainter tint. Default tone only. */
  variant?: "token" | "embedded"
  /** Colours the icon when the colour says something, such as a pull request's state. */
  accent?: InlineChipAccent
}

/**
 * One chip style for files, folders, chats, models, attachments and links, in composers and in
 * messages, in every app. With onClick it is a button; with href it opens a link.
 */
function InlineChip({ icon, children, title, onClick, href, className, selected, disabled, tone = "default", variant = "token", accent }: InlineChipProps) {
  const isEmbedded = variant === "embedded" && tone === "default"
  const recipe = isEmbedded ? INLINE_CHIP_EMBEDDED : INLINE_CHIP_TONES[tone]
  const look = isEmbedded ? embedded : variants[tone]
  const content = (
    <>
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </>
  )
  const classes = cn(
    isEmbedded ? embeddedLayout : layout,
    recipe.surface,
    recipe.text,
    accent ? accents[accent] : look.icon,
    (onClick || href) && cn("cursor-pointer", focus, look.hover),
    selected && "ring-2 ring-ring/50",
    className
  )
  if (href) {
    return (
      <a
        href={href}
        title={title}
        className={cn(classes, "no-underline")}
        onClick={onClick ? (event) => { event.preventDefault(); onClick(event) } : undefined}
        onAuxClick={onClick ? (event) => { if (event.button === 1) { event.preventDefault(); onClick(event) } } : undefined}
      >
        {content}
      </a>
    )
  }
  if (onClick) {
    return (
      <button type="button" title={title} disabled={disabled} onClick={onClick} className={cn(classes, "disabled:cursor-progress disabled:opacity-70")}>
        {content}
      </button>
    )
  }
  return (
    <span title={title} className={classes}>
      {content}
    </span>
  )
}

export { InlineChip }
export type { InlineChipProps }
