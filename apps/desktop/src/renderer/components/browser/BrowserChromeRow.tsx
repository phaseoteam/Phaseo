import { ArrowLeft, ArrowRight, Camera, Download, ExternalLink, MousePointerClick, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";

/** A ghost icon button with a tooltip, as in T3 Code's browser chrome. */
export function BrowserIconButton({ label, tooltip, icon, className, ...props }: { label: string; tooltip?: ReactNode; icon: ReactNode } & Omit<React.ComponentProps<typeof Button>, "children">) {
	return <Tooltip>
		<TooltipTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label={label} className={cn("text-muted-foreground hover:text-foreground [&_svg:not([class*='size-'])]:size-3.5", className)} {...props} />}>{icon}</TooltipTrigger>
		<TooltipContent>{tooltip ?? label}</TooltipContent>
	</Tooltip>;
}

type Props = {
	url: string; loading: boolean; canGoBack: boolean; canGoForward: boolean; hasPage: boolean;
	/** Bumping this focuses the address bar and selects it. */
	focusNonce: number;
	onBack: () => void; onForward: () => void; onReload: () => void; onSubmit: (value: string) => void; onOpenInBrowser: () => void;
	onPick: () => void; picking: boolean; onCapture: () => void; capturing: boolean;
	downloads: number; downloadsOpen: boolean; onDownloads: () => void;
	/** The zoom pill shown inside the address bar for a moment after zoom changes. */
	zoomIndicator?: ReactElement;
	menu: ReactNode;
};

/** One ghost row: navigation, the address bar, page tools and the menu. */
export function BrowserChromeRow({ url, loading, canGoBack, canGoForward, hasPage, focusNonce, onBack, onForward, onReload, onSubmit, onOpenInBrowser, onPick, picking, onCapture, capturing, downloads, downloadsOpen, onDownloads, zoomIndicator, menu }: Props) {
	const input = useRef<HTMLInputElement>(null);
	const [draft, setDraft] = useState(url);
	const [focused, setFocused] = useState(false);
	useEffect(() => { if (focusNonce) { input.current?.focus(); input.current?.select(); } }, [focusNonce]);
	const submit = () => { const next = draft.trim(); if (!next) return; onSubmit(next); input.current?.blur(); };
	return <div className="relative shrink-0">
		<form className="browser-toolbar flex h-7 min-h-7 items-center gap-1 px-1.5 my-1" onSubmit={event => { event.preventDefault(); submit(); }}>
			<div className="flex items-center gap-0.5" role="group" aria-label="Navigation">
				<BrowserIconButton label="Back" icon={<ArrowLeft />} disabled={!canGoBack} onClick={onBack} />
				<BrowserIconButton label="Forward" icon={<ArrowRight />} disabled={!canGoForward} onClick={onForward} />
				<BrowserIconButton label={loading ? "Stop" : "Reload"} tooltip={loading ? "Loading… click to stop" : "Reload"} icon={<RefreshCw className={cn("size-3.5", loading && "motion-safe:animate-spin")} />} disabled={!hasPage} onClick={onReload} />
			</div>
			<InputGroup className="group/address h-7 flex-1 bg-transparent transition-colors hover:bg-muted/40 has-[[data-slot=input-group-control]:focus-visible]:bg-background">
				<InputGroupInput ref={input} value={focused ? draft : url} onChange={event => setDraft(event.target.value)} aria-label="Browser address" placeholder="Search or enter URL" spellCheck={false} autoComplete="off"
					className="h-7 px-2 text-xs md:text-xs"
					onFocus={() => { setDraft(url); setFocused(true); queueMicrotask(() => input.current?.select()); }}
					onBlur={() => setFocused(false)}
					onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setDraft(url); input.current?.blur(); } }} />
				{zoomIndicator}
				{hasPage && !focused && <InputGroupAddon align="inline-end">
					{/* Revealed on hover so a resting address bar reads as plain text. */}
					<span className="pointer-events-none flex opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover/address:pointer-events-auto group-hover/address:opacity-100">
						<BrowserIconButton label="Open in system browser" icon={<ExternalLink />} onClick={onOpenInBrowser} />
					</span>
				</InputGroupAddon>}
			</InputGroup>
			<BrowserIconButton label={picking ? "Cancel annotation" : "Annotate page"} tooltip={picking ? "Cancel annotation (Esc)" : hasPage ? "Pick an element to add to your message" : "Open a page to annotate it"} icon={<MousePointerClick className={cn("size-3.5", picking && "text-primary")} />} aria-pressed={picking} variant={picking ? "secondary" : "ghost"} disabled={!hasPage} onClick={onPick} />
			<BrowserIconButton label="Capture screenshot" tooltip="Screenshot to your message and the clipboard" icon={<Camera />} disabled={!hasPage || capturing} onClick={onCapture} />
			{downloads > 0 && <Tooltip>
				<TooltipTrigger render={<Button type="button" variant={downloadsOpen ? "secondary" : "ghost"} size="xs" aria-label="Downloads" aria-pressed={downloadsOpen} onClick={onDownloads} className="h-6 gap-1 px-1.5 text-muted-foreground tabular-nums hover:text-foreground [&_svg]:size-3.5" />}><Download /><span>{downloads}</span></TooltipTrigger>
				<TooltipContent>Downloads</TooltipContent>
			</Tooltip>}
			{menu}
		</form>
		<div aria-hidden data-loading={loading} className="browser-loading-progress pointer-events-none absolute bottom-0 left-0 z-10 h-0.5 w-full origin-left rounded-r-full bg-primary" style={{ boxShadow: "0 0 6px 1px var(--color-ring)" }} />
	</div>;
}
