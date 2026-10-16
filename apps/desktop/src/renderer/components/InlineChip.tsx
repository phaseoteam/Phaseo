import type { MouseEvent, ReactNode } from "react";
import { cn } from "../lib/utils";

// A translucent tint so chips read on the page, in the composer and inside message bubbles alike.
// Aligned to the bottom of the surrounding text: a flex box would otherwise take its baseline from the icon and ride high.
const chip = "mx-px inline-flex max-w-full items-center gap-1 rounded-md bg-foreground/8 px-1.5 align-text-bottom text-[0.9em] leading-[1.45] font-medium text-foreground/90 [&_img]:size-3.5 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

/**
 * One chip style for files, folders, chats, attachments and links, in the composer and in messages.
 * With onClick it is a button; with href it opens a link.
 */
export function InlineChip({ icon, children, title, onClick, href, className, selected, disabled }: { icon?: ReactNode; children: ReactNode; title?: string; onClick?: (event: MouseEvent<HTMLElement>) => void; href?: string; className?: string; selected?: boolean; disabled?: boolean }) {
	const content = <>{icon}<span className="min-w-0 truncate">{children}</span></>;
	const classes = cn(chip, (onClick || href) && "cursor-pointer hover:bg-foreground/14", selected && "ring-2 ring-ring/50", className);
	if (href) return <a href={href} title={title} className={cn(classes, "no-underline")} onClick={onClick ? event => { event.preventDefault(); onClick(event); } : undefined} onAuxClick={onClick ? event => { if (event.button === 1) { event.preventDefault(); onClick(event); } } : undefined}>{content}</a>;
	if (onClick) return <button type="button" title={title} disabled={disabled} onClick={onClick} className={cn(classes, "disabled:cursor-progress disabled:opacity-70")}>{content}</button>;
	return <span title={title} className={classes}>{content}</span>;
}
