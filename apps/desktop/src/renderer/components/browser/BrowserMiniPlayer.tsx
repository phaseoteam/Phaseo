import { PanelRight, PictureInPicture2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { BrowserState } from "../../../shared/browser";
import { useWorkspace } from "../../app/workspace";
import { closeMiniPlayer, miniPlayerCornerRadius, miniPlayerSource, placeMiniPlayer, resizeMiniPlayer, resolveMiniPlayerFrame, clampMiniPlayerPosition, useBrowserSurfaceShown, useMiniPlayer, type MiniPlayerFrame, type MiniPlayerResizeDirection, type MiniPlayerSize, type MiniPlayerState } from "../../lib/browserMiniPlayer";
import { useBrowserRecording } from "../../lib/browserRecording";
import { recordBrowserState, revealBrowserTab, useBrowserTab } from "../../lib/browserTabs";
import { cn } from "../../lib/utils";
import { overlayOpen } from "../../views/BrowserSurface";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { BrowserPoppedOut } from "./BrowserStates";

// Grab zones just outside each edge; the cursor is the only affordance. The native page covers the inside.
const resizeHandles: { direction: MiniPlayerResizeDirection; className: string }[] = [
	{ direction: "north", className: "inset-x-2 -top-2 h-2 cursor-ns-resize" },
	{ direction: "south", className: "inset-x-2 -bottom-2 h-2 cursor-ns-resize" },
	{ direction: "west", className: "inset-y-2 -left-2 w-2 cursor-ew-resize" },
	{ direction: "east", className: "inset-y-2 -right-2 w-2 cursor-ew-resize" },
	{ direction: "northwest", className: "-top-2 -left-2 size-4 cursor-nwse-resize" },
	{ direction: "northeast", className: "-top-2 -right-2 size-4 cursor-nesw-resize" },
	{ direction: "southwest", className: "-bottom-2 -left-2 size-4 cursor-nesw-resize" },
	{ direction: "southeast", className: "-right-2 -bottom-2 size-4 cursor-nwse-resize" },
];
// A touch that travels less than this is a tap on the handle, not a drag.
const tapSlop = 6;
type Gesture = { pointerId: number; pointerType: string; x: number; y: number; frame: MiniPlayerFrame; direction: MiniPlayerResizeDirection | null; moved: boolean };

/** The floating player over the chat, for the chat's floated browser tab. Render it inside the chat column (position: relative). */
export function BrowserMiniPlayerHost() {
	const { selectedId, settings, scheduled, pullRequestsPage, compareId, compareGroups, commandsOpen } = useWorkspace();
	const context = selectedId ?? "draft";
	const player = useMiniPlayer(context);
	const tab = useBrowserTab(context, player?.tabId ?? "");
	// The player steps aside while its tab shows in the pane.
	const shownInPane = useBrowserSurfaceShown(player?.tabId);
	if (!player || !tab || shownInPane || settings || scheduled || pullRequestsPage || compareGroups.some(group => group.id === compareId)) return null;
	return <BrowserMiniPlayer key={player.tabId} context={context} player={player} covered={commandsOpen} />;
}

/** The floating player for one tab: its native page moves into this frame (12 px corners), with a hover pill above it. */
export function BrowserMiniPlayer({ context, player, covered }: { context: string; player: MiniPlayerState; covered: boolean }) {
	const api = window.phaseoDesktop;
	const tabId = player.tabId;
	const tab = useBrowserTab(context, tabId);
	const recording = useBrowserRecording(tabId);
	const container = useRef<HTMLDivElement>(null);
	const slot = useRef<HTMLDivElement>(null);
	const handle = useRef<HTMLDivElement>(null);
	const gesture = useRef<Gesture | undefined>(undefined);
	const tapped = useRef(false);
	const restored = useRef(false);
	const [area, setArea] = useState<MiniPlayerSize>();
	const [live, setLive] = useState<MiniPlayerFrame>();
	const [state, setState] = useState<BrowserState>();
	const [pillOpen, setPillOpen] = useState(false);
	const source = miniPlayerSource(player.source);
	const frame = live ?? (area ? resolveMiniPlayerFrame(player, area) : undefined);

	useLayoutEffect(() => {
		const element = container.current;
		if (!element) return;
		const measure = () => setArea(current => current?.width === element.clientWidth && current.height === element.clientHeight ? current : { width: element.clientWidth, height: element.clientHeight });
		measure();
		const observer = new ResizeObserver(measure); observer.observe(element);
		return () => observer.disconnect();
	}, []);

	// A fresh native page (after a restart) opens the tab's saved address.
	const apply = useRef<(value?: BrowserState) => void>(() => undefined);
	apply.current = (value?: BrowserState) => {
		if (value?.id !== tabId) return;
		setState(value); recordBrowserState(value);
		if (!restored.current) { restored.current = true; if (!value.configured && !value.url && tab?.url) void api?.browser({ id: tabId, type: "navigate", url: tab.url }).then(next => apply.current(next), () => undefined); }
	};
	useEffect(() => api?.onBrowserState(value => apply.current(value)), [api]);
	useEffect(() => () => { void api?.browser({ type: "hide", id: tabId, slot: "float" }).catch(() => undefined); }, [api, tabId]);

	// The native page sits over the frame, and hides while a menu or dialog is open, since it would draw over them.
	useEffect(() => {
		const element = slot.current;
		if (!api || !element || !frame) return;
		let last = "", pending = 0;
		const place = () => {
			if (covered || overlayOpen()) { if (last !== "hidden") void api.browser({ type: "hide", id: tabId, slot: "float" }).catch(() => undefined); last = "hidden"; return; }
			const rect = element.getBoundingClientRect(), signature = [rect.x, rect.y, rect.width, rect.height].join();
			if (signature === last) return;
			last = signature;
			void api.browser({ type: "show", id: tabId, slot: "float", radius: miniPlayerCornerRadius, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }).then(value => apply.current(value), () => undefined);
		};
		const overlays = new MutationObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(place); });
		overlays.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "data-open", "data-closed"] });
		window.addEventListener("resize", place); place();
		return () => { overlays.disconnect(); cancelAnimationFrame(pending); window.removeEventListener("resize", place); };
	}, [api, tabId, covered, frame?.x, frame?.y, frame?.width, frame?.height, state?.poppedOut]);

	// Touch has no hover, so a tap on the handle opens the pill; a tap anywhere else closes it.
	useEffect(() => {
		if (!pillOpen) return;
		const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && handle.current?.contains(event.target)) return; setPillOpen(false); };
		document.addEventListener("pointerdown", dismiss, true);
		return () => document.removeEventListener("pointerdown", dismiss, true);
	}, [pillOpen]);

	const begin = (event: ReactPointerEvent<HTMLElement>, direction: MiniPlayerResizeDirection | null) => {
		if (event.button !== 0 || !frame) return;
		gesture.current = { pointerId: event.pointerId, pointerType: event.pointerType, x: event.clientX, y: event.clientY, frame, direction, moved: false };
		event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); event.stopPropagation();
	};
	const move = (event: ReactPointerEvent<HTMLElement>) => {
		const current = gesture.current;
		if (!current || current.pointerId !== event.pointerId || !area) return;
		const delta = { x: event.clientX - current.x, y: event.clientY - current.y };
		if (!current.moved && Math.hypot(delta.x, delta.y) < tapSlop) return;
		current.moved = true;
		if (current.direction === null) setLive({ ...current.frame, ...clampMiniPlayerPosition({ x: current.frame.x + delta.x, y: current.frame.y + delta.y }, area, current.frame) });
		else setLive(resizeMiniPlayer(current.frame, current.direction, delta, source, area));
	};
	const end = (event: ReactPointerEvent<HTMLElement>) => {
		const current = gesture.current;
		if (current?.pointerId !== event.pointerId) return;
		gesture.current = undefined;
		tapped.current = event.type === "pointerup" && current.direction === null && current.pointerType === "touch" && !current.moved;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
		if (live) { placeMiniPlayer(context, live); setLive(undefined); }
	};

	const poppedOut = Boolean(state?.poppedOut);
	const openInPanel = () => { closeMiniPlayer(context); revealBrowserTab(context, tabId); };
	const togglePopOut = () => void api?.browser({ id: tabId, type: poppedOut ? "popIn" : "popOut" }).then(value => apply.current(value), () => undefined);
	const pillButton = (label: string, tooltip: string, icon: React.ReactNode, onClick: () => void, options: { pressed?: boolean; disabled?: boolean } = {}) => <Tooltip>
		<TooltipTrigger render={<Button type="button" variant={options.pressed ? "secondary" : "ghost"} size="icon-xs" aria-label={label} disabled={options.disabled} onPointerDown={event => event.stopPropagation()} onClick={onClick} />}>{icon}</TooltipTrigger>
		<TooltipContent side="top">{tooltip}</TooltipContent>
	</Tooltip>;

	return <div ref={container} className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
		{frame && <section aria-label="Floating browser preview" data-browser-mini-player={tabId} className="pointer-events-none absolute select-none"
			style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height, borderRadius: miniPlayerCornerRadius }}>
			{/* The handle and pill sit just above the frame: the native page draws over anything inside it. */}
			<div ref={handle} data-pill-open={pillOpen ? "" : undefined} className="group pointer-events-auto absolute right-2 -top-5 z-10 size-3 touch-none cursor-grab active:cursor-grabbing pointer-coarse:-m-2.5 pointer-coarse:size-8"
				onPointerDown={event => begin(event, null)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
				onClick={() => { if (!tapped.current) return; tapped.current = false; setPillOpen(open => !open); }}>
				<div role={recording ? "status" : undefined} aria-label={recording ? "Recording preview" : undefined} aria-hidden={!recording}
					className="absolute right-0 bottom-0 size-2 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0 group-data-[pill-open]:opacity-0 pointer-coarse:right-2.5 pointer-coarse:bottom-2.5">
					<span className={cn("block size-2 rounded-full shadow-sm ring-1 ring-background/70", recording ? "bg-destructive motion-safe:animate-pulse" : "bg-foreground/25")} />
				</div>
				<div className="pointer-events-none absolute right-0 bottom-0 flex h-8 cursor-grab items-center gap-0.5 rounded-lg border border-border/80 bg-popover/90 p-0.5 opacity-0 shadow-lg backdrop-blur-xl transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-data-[pill-open]:pointer-events-auto group-data-[pill-open]:opacity-100 active:cursor-grabbing pointer-coarse:right-2.5 pointer-coarse:bottom-2.5">
					{recording && <span aria-hidden className="flex size-6 shrink-0 items-center justify-center"><span className="size-2 rounded-full bg-destructive motion-safe:animate-pulse" /></span>}
					{pillButton("Open preview in right panel", "Open in right panel", <PanelRight />, openInPanel)}
					{pillButton(poppedOut ? "Close popped-out preview" : "Pop preview into separate window", poppedOut ? "Close separate window" : "Pop into separate window", <PictureInPicture2 />, togglePopOut, { pressed: poppedOut, disabled: !poppedOut && !state?.url })}
					{pillButton("Close floating preview", "Close floating preview", <X />, () => closeMiniPlayer(context))}
				</div>
			</div>
			<div aria-hidden className="absolute inset-0 rounded-[inherit] bg-muted shadow-2xl ring-1 ring-border/80" />
			<div ref={slot} className="absolute inset-0 overflow-hidden rounded-[inherit]">
				{poppedOut ? <BrowserPoppedOut compact onBringBack={togglePopOut} />
					: !state?.url && <div className="pointer-events-none flex h-full items-center justify-center text-xs text-muted-foreground">{tab?.url ? "Reconnecting preview…" : "No page yet"}</div>}
			</div>
			{resizeHandles.map(({ direction, className }) => <div key={direction} role="presentation" data-browser-mini-player-resize={direction} className={cn("pointer-events-auto absolute touch-none", className)}
				onPointerDown={event => begin(event, direction)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />)}
		</section>}
	</div>;
}
