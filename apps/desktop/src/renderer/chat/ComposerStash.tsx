import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Bookmark, FileText, Paperclip } from "lucide-react";
import { shortDuration } from "../../shared/threadLifecycle";
import { mentionPlainText, parseMentions } from "../lib/mentions";
import { cn } from "../lib/utils";
import { BannerActions, BannerContent, BannerCount, BannerDismiss, BannerIcon, BannerRoot, BannerRow, BannerRowButton, BannerScroll, BannerToggleIcon } from "./ComposerBanner";
import type { StashedPrompt } from "./promptStash";
import { stashSnippet } from "./promptStash";

/** The stash's tab beside the drawers above the box, once something is stashed. Each new stash replays its pulse. */
export function StashBadge({ count, open, pulse, onToggle }: { count: number; open: boolean; pulse: number; onToggle: () => void }) {
	if (!count) return null;
	return <BannerRoot className="w-fit">
		<BannerRowButton data-prompt-stash-badge aria-label={`Stashed drafts: ${count}. Open stash.`} aria-expanded={open} onPointerDown={event => event.preventDefault()} onClick={onToggle}
			className={cn("pr-1", open ? "pointer-events-none text-foreground" : "text-muted-foreground hover:text-foreground")}>
			<BannerIcon><Bookmark /></BannerIcon>
			<BannerContent>Stash</BannerContent>
			{/* Remounting the count per stash restarts its fade in; no timer has to end it. */}
			<BannerActions><BannerCount key={pulse} className={cn(pulse > 0 && "transition-[opacity,translate] duration-200 ease-out starting:translate-y-0.5 starting:opacity-0 motion-reduce:transition-none")}>{count}</BannerCount></BannerActions>
		</BannerRowButton>
	</BannerRoot>;
}

const attachmentCount = (text: string) => parseMentions(text).filter(segment => typeof segment !== "string" && (segment.kind === "attachment" || segment.kind === "image")).length;

/**
 * The open stash, above the box: Up and Down move, Enter brings a draft back, Mod+Backspace deletes it and Escape closes.
 * The box hands it those keys while it is open (`onKey`); a click anywhere else closes it.
 */
export function StashDrawer({ items, shortcut, onRestore, onDelete, onClose, keys }: {
	items: readonly StashedPrompt[];
	shortcut?: string;
	onRestore: (id: string) => void;
	onDelete: (id: string) => void;
	onClose: () => void;
	/** Receives the drawer's key handler, so keys typed in the box reach it first. */
	keys: { current?: (event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "preventDefault">) => boolean };
}) {
	const [highlighted, setHighlighted] = useState(items[0]?.id);
	const active = items.find(item => item.id === highlighted) ?? items[0];
	const drawer = useRef<HTMLDivElement>(null);
	const now = Date.now();
	const onKey = (event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "preventDefault">) => {
		if (event.key === "Escape") { event.preventDefault(); onClose(); return true; }
		if ((event.key === "ArrowDown" || event.key === "ArrowUp") && items.length) {
			event.preventDefault();
			const index = Math.max(0, items.findIndex(item => item.id === active?.id)), next = items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
			setHighlighted(next.id); drawer.current?.querySelector(`[data-stash-entry="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: "nearest" });
			return true;
		}
		if (event.key === "Enter" && active) { event.preventDefault(); onRestore(active.id); return true; }
		if (event.key === "Backspace" && (event.ctrlKey || event.metaKey) && active) { event.preventDefault(); onDelete(active.id); return true; }
		return false;
	};
	keys.current = onKey;
	useEffect(() => () => { keys.current = undefined; }, [keys]);
	// A click outside the drawer and its tab closes it, as a menu does.
	useEffect(() => {
		const close = (event: PointerEvent) => { const target = event.target as Element | null; if (!drawer.current?.contains(target) && !target?.closest?.("[data-prompt-stash-badge]")) onClose(); };
		document.addEventListener("pointerdown", close, true);
		return () => document.removeEventListener("pointerdown", close, true);
	}, [onClose]);
	return <BannerRoot ref={drawer} data-composer-stash-drawer onKeyDown={(event: ReactKeyboardEvent) => { if ((event.target as HTMLElement).closest("[data-stash-delete]")) return; onKey(event.nativeEvent); }}>
		<BannerRowButton aria-label="Close stash" aria-expanded onPointerDown={event => event.preventDefault()} onClick={onClose}>
			<BannerIcon><Bookmark /></BannerIcon>
			<BannerContent className="text-muted-foreground">Stash</BannerContent>
			<BannerActions className="gap-0"><BannerCount>{items.length}</BannerCount><BannerToggleIcon expanded /></BannerActions>
		</BannerRowButton>
		<BannerScroll>
			<ul aria-label="Stashed drafts" className="grid gap-px">
				{!items.length && <BannerRow as="li"><BannerIcon /><BannerContent className="text-muted-foreground">Nothing stashed yet.{shortcut ? ` Press ${shortcut} with a draft in the box to stash it.` : ""}</BannerContent></BannerRow>}
				{items.map(item => {
					const files = attachmentCount(item.text);
					return <BannerRow as="li" key={item.id} data-stash-entry={item.id} data-highlighted={item.id === active?.id || undefined} onMouseMove={() => { if (highlighted !== item.id) setHighlighted(item.id); }}
						className={cn("relative rounded-md", item.id === active?.id && "bg-muted text-foreground")}>
						<BannerIcon><FileText /></BannerIcon>
						<BannerContent>
							<button type="button" data-stash-restore={item.id} aria-label={`Restore stashed draft: ${stashSnippet(mentionPlainText(item.text))}`} onPointerDown={event => event.preventDefault()} onClick={() => onRestore(item.id)}
								className="min-w-0 flex-1 cursor-pointer truncate text-left text-foreground/80 outline-none before:absolute before:inset-0 before:rounded-md focus-visible:before:ring-2 focus-visible:before:ring-ring focus-visible:before:ring-inset">{stashSnippet(mentionPlainText(item.text))}</button>
						</BannerContent>
						<BannerActions>
							{files > 0 && <span className="flex shrink-0 items-center gap-1 text-muted-foreground"><Paperclip aria-hidden className="size-3" />{files}</span>}
							<time dateTime={item.createdAt} className="shrink-0 text-muted-foreground tabular-nums">{shortDuration(now - Date.parse(item.createdAt))}</time>
							<BannerDismiss data-stash-delete className="relative z-10" aria-label="Delete stashed draft" onPointerDown={event => event.preventDefault()} onClick={() => onDelete(item.id)} />
						</BannerActions>
					</BannerRow>;
				})}
			</ul>
		</BannerScroll>
	</BannerRoot>;
}
