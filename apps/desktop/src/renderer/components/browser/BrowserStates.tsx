import { formatRelativeTime } from "@phaseo/app-kit/format";
import { ChevronRight, Globe, Globe2, History, PictureInPicture2, RadioTower, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { describeBrowserError, type BrowserFailure, type BrowserLocalServer } from "../../../shared/browser";
import type { BrowserRecent } from "../../lib/browserHistory";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";

/** A page icon, or a globe when there is none or it fails to load. */
export function BrowserFavicon({ src, className }: { src?: string; className?: string }) {
	const [failed, setFailed] = useState<string>();
	if (!src || failed === src) return <Globe2 aria-hidden className={cn("size-4 shrink-0 text-muted-foreground", className)} />;
	return <img src={src} alt="" aria-hidden draggable={false} className={cn("size-4 shrink-0 rounded-sm object-contain", className)} onError={() => setFailed(src)} />;
}

const displayAddress = (url: string) => { try { const parsed = new URL(url); return parsed.host + (parsed.pathname === "/" ? "" : parsed.pathname) + parsed.search + parsed.hash; } catch { return url; } };

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
	return <section className="flex flex-col gap-2">
		<div className="flex items-center gap-2 px-1 text-xs text-muted-foreground [&_svg]:size-3.5"><span aria-hidden>{icon}</span><h2 className="font-medium">{title}</h2></div>
		<div className="flex flex-col divide-y divide-border/60 border-y border-border/60">{children}</div>
	</section>;
}

/** A new tab: recently used pages for the project and local web servers, in flat rows. */
export function BrowserEmptyState({ recents, onOpen, onRemove }: { recents: BrowserRecent[]; onOpen: (url: string) => void; onRemove: (url: string) => void }) {
	const [servers, setServers] = useState<BrowserLocalServer[]>([]);
	useEffect(() => {
		let active = true;
		const load = () => void window.phaseoDesktop?.browserLocalServers().then(values => { if (active) setServers(values); }, () => undefined);
		load();
		const timer = window.setInterval(load, 5000);
		return () => { active = false; window.clearInterval(timer); };
	}, []);
	const shown = recents.slice(0, 8);
	if (!shown.length && !servers.length) return <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
		<span className="mb-1 flex size-9 items-center justify-center rounded-md bg-muted"><Globe className="size-4.5 text-muted-foreground" /></span>
		<h2 className="text-sm font-medium">No page yet</h2>
		<p className="max-w-xs text-xs leading-relaxed text-muted-foreground">Type an address or a search above, or start a dev server. Local servers ready for a browser show up here.</p>
	</div>;
	return <ScrollArea className="h-full">
		<div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-8">
			{shown.length > 0 && <Section icon={<History />} title="Recently used">{shown.map(entry => <div key={entry.url} className="group relative flex items-center">
				<button type="button" onClick={() => onOpen(entry.url)} className="flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 pr-9 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
					<BrowserFavicon src={entry.favicon} />
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="truncate text-xs font-medium text-foreground">{entry.title || displayAddress(entry.url)}</span>
						<span className="truncate text-xs text-muted-foreground">{entry.title ? displayAddress(entry.url) + " · " : ""}{formatRelativeTime(entry.at)}</span>
					</span>
				</button>
				<button type="button" aria-label={`Remove ${displayAddress(entry.url)} from history`} onClick={() => onRemove(entry.url)} className="absolute right-2 rounded p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"><X className="size-3.5" /></button>
			</div>)}</Section>}
			{servers.length > 0 && <Section icon={<RadioTower />} title="Local servers">{servers.map(server => <button key={server.port} type="button" onClick={() => onOpen(server.url)} className="flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
				<BrowserFavicon />
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="truncate text-xs font-medium text-foreground">{server.process || "Listening"}</span>
					<span className="truncate text-xs text-muted-foreground">{server.host}:{server.port}</span>
				</span>
			</button>)}</Section>}
			{servers.length > 0 && <p className="px-1 text-xs text-muted-foreground">Select a local server to open it in this tab.</p>}
		</div>
	</ScrollArea>;
}

/** Chromium's "This site can't be reached" page, in the app's colours. */
export function BrowserUnreachable({ failure, onReload }: { failure: BrowserFailure; onReload: () => void }) {
	const [details, setDetails] = useState(false);
	let host = failure.url; try { host = new URL(failure.url).host || failure.url; } catch { /* Show the raw address. */ }
	const code = failure.description || `ERR_${Math.abs(failure.code) || "FAILED"}`;
	return <ScrollArea className="h-full bg-background">
		<div className="mx-auto flex min-h-full w-full max-w-xl flex-col px-8 py-12">
			<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className="mb-6 size-12 text-muted-foreground/70"><path d="M16 12 L48 12 L48 52 L16 52 Z" /><path d="M22 22 L42 22 M22 30 L36 30 M22 38 L40 38" strokeLinecap="round" /><path d="M52 8 L12 56" strokeLinecap="round" /></svg>
			<h1 className="mb-3 text-2xl leading-tight font-semibold text-foreground">This site can’t be reached</h1>
			<p className="text-sm leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">{host}</span>: {describeBrowserError(failure.description)}.</p>
			{details && <div className="mt-6 border-l-2 border-border pl-4 text-sm">
				<p className="mb-2 font-medium text-foreground">Try:</p>
				<ul className="list-disc space-y-1 pl-5 text-muted-foreground"><li>Checking your connection</li><li>Confirming the dev server is running</li><li>Checking the proxy and the firewall</li></ul>
				<p className="mt-4 font-mono text-xs text-muted-foreground/80">{code}</p>
			</div>}
			<div className="mt-8 flex items-center gap-2">
				<Button type="button" variant="ghost" size="sm" aria-expanded={details} onClick={() => setDetails(value => !value)}><ChevronRight className={cn("size-3.5 transition-transform", details && "rotate-90")} />{details ? "Hide details" : "Details"}</Button>
				<div className="flex-1" />
				<Button type="button" size="sm" onClick={onReload}>Reload</Button>
			</div>
		</div>
	</ScrollArea>;
}

/** The page is in its own window (a separate preview window); the slot offers to bring it back. */
export function BrowserPoppedOut({ onBringBack, compact = false }: { onBringBack: () => void; compact?: boolean }) {
	return <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
		<PictureInPicture2 aria-hidden className="size-4.5 text-muted-foreground" />
		<p className="text-xs text-muted-foreground">Showing in a separate window</p>
		<Button type="button" variant="outline" size={compact ? "xs" : "sm"} onClick={onBringBack}>Bring back</Button>
	</div>;
}

/** The "Recording saved" notice as a flat row: reveal the file, copy its path, or add it to the message. */
export function BrowserRecordingNotice({ path, revealLabel, onReveal, onAttach, onDismiss }: { path: string; revealLabel: string; onReveal: () => void; onAttach: () => void; onDismiss: () => void }) {
	const [copied, setCopied] = useState(false);
	useEffect(() => { if (!copied) return; const timer = window.setTimeout(() => setCopied(false), 2000); return () => window.clearTimeout(timer); }, [copied]);
	return <div role="status" className="flex shrink-0 items-center gap-2 border-y border-border/60 px-3 py-1.5 text-xs">
		<span aria-hidden className="size-1.5 shrink-0 rounded-full bg-success" />
		<span className="font-medium text-foreground">Recording saved</span>
		<span className="min-w-0 flex-1 truncate text-muted-foreground" title={path}>{path.split(/[\\/]/).at(-1)}</span>
		<Button type="button" variant="ghost" size="xs" onClick={onReveal}>{revealLabel}</Button>
		<Button type="button" variant="ghost" size="xs" disabled={copied} onClick={() => void navigator.clipboard.writeText(path).then(() => setCopied(true), () => undefined)}>{copied ? "Copied!" : "Copy path"}</Button>
		<Button type="button" variant="ghost" size="xs" onClick={onAttach}>Add to message</Button>
		<Button type="button" variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={onDismiss}><X /></Button>
	</div>;
}
