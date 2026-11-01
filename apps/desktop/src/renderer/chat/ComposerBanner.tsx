import type { ComponentProps, ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { ScrollArea } from "../components/ui/scroll-area";
import { cn } from "../lib/utils";

/**
 * Notices and drawers that belong to the message box sit just above it, a little narrower, with their bottom tucked under
 * the box: queued messages, an open question, the stash, usage limits, the `/` and `@` menus. Each pads its bottom by the
 * overlap so nothing it shows is hidden.
 */
export type BannerVariant = "default" | "warning" | "error";

/** How far a drawer reaches under the box below it, and how far in from its sides it sits. */
const overlap = "[--composer-overlap:calc(1rem+1px)]";
const tints: Record<BannerVariant, string> = {
	default: "bg-card",
	warning: "bg-[color-mix(in_srgb,var(--warning)_7%,var(--card))]",
	error: "bg-[color-mix(in_srgb,var(--destructive)_7%,var(--card))]",
};

/** A drawer's surface. Detached ones stand on their own instead of joining the box. */
export function BannerRoot({ variant = "default", detached = false, className, children, ...props }: ComponentProps<"div"> & { variant?: BannerVariant; detached?: boolean }) {
	return <div data-composer-banner={detached ? "detached" : "attached"} data-variant={variant} {...props}
		className={cn(overlap, "relative min-w-0 border border-border px-1 pt-1 text-xs shadow-sm dark:shadow-black/20", tints[variant],
			detached ? "rounded-md pb-1" : "rounded-t-md border-b-0 pb-[calc(var(--composer-overlap)+0.25rem)]", className)}>
		{children}
	</div>;
}

/** One attached drawer in the stack above the box; consecutive drawers join edge to edge. */
export function BannerSlot({ className, ...props }: ComponentProps<"div">) {
	return <div data-slot="composer-banner-slot" {...props}
		className={cn("relative mx-auto -mb-[calc(1rem+1px)] w-[calc(100%-2.75rem)] [&+[data-slot=composer-banner-slot]_[data-composer-banner=attached]]:rounded-t-none", className)} />;
}

/** The stack above the box: drawers on the left, and the stash's tab on the right when there is one. */
export function BannerDock({ children, aside }: { children?: ReactNode; aside?: ReactNode }) {
	return <div data-slot="composer-banner-dock" className="relative mx-auto -mb-[calc(1rem+1px)] flex w-[calc(100%-2.75rem)] items-end justify-end gap-1 not-has-[[data-composer-banner]]:hidden">
		<div data-slot="composer-banner-column" className="flex min-w-0 flex-1 flex-col empty:hidden [&>[data-slot=composer-banner-slot]]:w-full [&>[data-slot=composer-banner-slot]:last-child]:mb-0">{children}</div>
		<div data-slot="composer-banner-aside" className="flex shrink-0 empty:hidden">{aside}</div>
	</div>;
}

export function BannerRow({ className, as = "div", ...props }: Omit<ComponentProps<"div">, "ref"> & { as?: "div" | "li" }) {
	const rowClass = cn("group/banner-row grid min-h-7 w-full min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-1 text-left", className);
	return as === "li" ? <li data-composer-banner-row {...props as Omit<ComponentProps<"li">, "ref">} className={rowClass} /> : <div data-composer-banner-row {...props} className={rowClass} />;
}

/** A row that is itself a button, such as a drawer's header that folds it. */
export function BannerRowButton({ className, ...props }: ComponentProps<"button">) {
	return <button type="button" data-composer-banner-row {...props}
		className={cn("group/banner-row grid min-h-7 w-full min-w-0 cursor-pointer grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-1 rounded-md text-left outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset", className)} />;
}

export function BannerIcon({ className, ...props }: ComponentProps<"span">) {
	return <span aria-hidden {...props} className={cn("col-start-1 row-start-1 flex w-7 items-center justify-center text-muted-foreground [&>svg]:size-3.5", className)} />;
}

export function BannerContent({ className, ...props }: ComponentProps<"span">) {
	return <span {...props} className={cn("col-start-2 row-start-1 flex min-w-0 items-center gap-1", className)} />;
}

export function BannerSeparator() {
	return <span aria-hidden className="mx-1 inline-block flex-none text-muted-foreground/40">·</span>;
}

export function BannerActions({ className, ...props }: ComponentProps<"span">) {
	return <span {...props} className={cn("col-start-3 row-start-1 flex flex-wrap items-center justify-end gap-1 pr-0.5", className)} />;
}

export function BannerCount({ className, ...props }: ComponentProps<"span">) {
	return <span {...props} className={cn("inline-flex min-w-7 flex-none justify-center font-medium text-muted-foreground tabular-nums", className)} />;
}

export function BannerToggleIcon({ expanded }: { expanded: boolean }) {
	return <span aria-hidden className="grid size-6 place-items-center text-muted-foreground"><ChevronDown className={cn("size-3.5 transition-transform", !expanded && "rotate-180")} /></span>;
}

export function BannerDismiss({ className, children, ...props }: ComponentProps<typeof Button>) {
	return <Button type="button" size="icon-xs" variant="ghost" {...props} className={cn("text-muted-foreground", className)}>{children ?? <X className="size-3.5" />}</Button>;
}

export function BannerScroll({ className, children }: { className?: string; children: ReactNode }) {
	return <ScrollArea className={cn("max-h-[min(24rem,40vh)]", className)} viewportClassName={cn("max-h-[min(24rem,40vh)]", className)}>{children}</ScrollArea>;
}

/** A one-line notice about sending from this box, with its actions and an optional body under it. */
export function ComposerNotice({ variant = "default", icon, title, description, actions, onDismiss, dismissLabel = "Dismiss", children, role, label }: {
	variant?: BannerVariant;
	icon: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	onDismiss?: () => void;
	dismissLabel?: string;
	children?: ReactNode;
	role?: "status" | "alert";
	label?: string;
}) {
	return <BannerSlot className="transition-opacity duration-150 starting:opacity-0 motion-reduce:transition-none">
		<BannerRoot variant={variant} role={role ?? (variant === "default" ? undefined : "alert")} aria-label={label}>
			<BannerRow className="flex flex-wrap">
				<BannerIcon className="h-7 self-start">{icon}</BannerIcon>
				<BannerContent className="min-w-0 flex-1 basis-40 py-1.5 leading-4">
					<span className="min-w-0 font-medium text-foreground">{title}</span>
					{description && <span className="min-w-0 truncate text-muted-foreground">{description}</span>}
				</BannerContent>
				{(actions || onDismiss) && <BannerActions className="ml-auto">{actions}{onDismiss && <BannerDismiss aria-label={dismissLabel} onClick={onDismiss} />}</BannerActions>}
			</BannerRow>
			{children && <div className="pr-2 pb-1 pl-8">{children}</div>}
		</BannerRoot>
	</BannerSlot>;
}
