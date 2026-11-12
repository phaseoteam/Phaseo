import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { FileText } from "lucide-react";
import { mentionPlainText } from "../lib/mentions";
import { cn } from "../lib/utils";

/** One user message and the answer it got, as the rail lists them. Ported from the web chat's ChatMessageNavigationRail. */
export type RailTurn = { id: string; user: string; assistant?: string; attachments: string[] };

const HOVER_MARKER_WIDTHS = [28, 18, 12, 8] as const;
const DEFAULT_MARKER_WIDTH = 6;

function preview(text: string) {
	return mentionPlainText(text).replace(/\s+/g, " ").trim() || "Empty message";
}

function attachmentLabel(names: string[]) {
	if (names.length === 1) return names[0];
	if (names.length > 1) return `${names[0]} and ${names.length - 1} more`;
	return null;
}

function markerClass(isCurrent: boolean, isVisible: boolean, isNavigatingTarget: boolean, hoverDistance: number, isActive: boolean) {
	if (isCurrent) return isActive && hoverDistance === 0 ? "h-0.5 bg-foreground" : "h-px bg-foreground";
	if (isNavigatingTarget && hoverDistance === 0) return "h-0.5 bg-foreground/60";
	if (isActive) {
		if (hoverDistance === 0) return "h-0.5 bg-foreground";
		if (hoverDistance === 1) return "h-px bg-foreground/80";
		if (hoverDistance === 2) return "h-px bg-foreground/60";
		if (hoverDistance === 3) return "h-px bg-foreground/45";
	}
	if (isVisible) return "h-px bg-foreground";
	return "h-px bg-muted-foreground/45";
}

const turnElement = (viewport: HTMLElement, id: string) => viewport.querySelector<HTMLElement>(`[data-turn-id="${CSS.escape(id)}"]`);

/** Which turn sits at the top of the viewport, which are on screen, and whether there is anywhere to scroll. */
function useTurnVisibility(viewport: RefObject<HTMLDivElement | null>, turns: RailTurn[]) {
	const [state, setState] = useState<{ current?: string; visible: string[]; scrollable: boolean }>({ visible: [], scrollable: false });
	const measure = useCallback(() => {
		const element = viewport.current;
		if (!element) return;
		const box = element.getBoundingClientRect();
		let current: string | undefined; const visible: string[] = [];
		for (const turn of turns) {
			const node = turnElement(element, turn.id);
			if (!node) continue;
			// The turn's element holds the question and its answer.
			const rect = node.getBoundingClientRect();
			if (rect.top <= box.top + 24) current = turn.id;
			if (rect.bottom > box.top && rect.top < box.bottom) visible.push(turn.id);
		}
		current ??= turns[0]?.id;
		const scrollable = element.scrollHeight > element.clientHeight + 1;
		setState(previous => previous.current === current && previous.scrollable === scrollable && previous.visible.join() === visible.join() ? previous : { current, visible, scrollable });
	}, [viewport, turns]);
	useEffect(() => {
		const element = viewport.current;
		if (!element) return;
		measure();
		element.addEventListener("scroll", measure, { passive: true });
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		if (element.firstElementChild) observer.observe(element.firstElementChild);
		return () => { element.removeEventListener("scroll", measure); observer.disconnect(); };
	}, [viewport, measure]);
	return state;
}

export function MessageNavigationRail({ turns, viewport, onNavigate }: { turns: RailTurn[]; viewport: RefObject<HTMLDivElement | null>; onNavigate?: () => void }) {
	const { current: currentAnchorId, visible: visibleIds, scrollable } = useTurnVisibility(viewport, turns);
	const [hoveredTurnId, setHoveredTurnId] = useState<string | null>(null);
	const [navigatingTurnId, setNavigatingTurnId] = useState<string | null>(null);
	const [isHoverTransitionReady, setIsHoverTransitionReady] = useState(false);
	const hidePreviewTimeout = useRef<number | null>(null);
	const navigationTimeout = useRef<number | null>(null);

	const activeTurnId = hoveredTurnId ?? navigatingTurnId;
	const activeTurnIndex = activeTurnId ? turns.findIndex(turn => turn.id === activeTurnId) : -1;
	const previewTurnIndex = hoveredTurnId ? turns.findIndex(turn => turn.id === hoveredTurnId) : -1;
	const previewTurn = previewTurnIndex >= 0 ? turns[previewTurnIndex] : null;

	const clearHidePreview = useCallback(() => {
		if (hidePreviewTimeout.current !== null) { window.clearTimeout(hidePreviewTimeout.current); hidePreviewTimeout.current = null; }
	}, []);
	const showPreview = useCallback((id: string) => { clearHidePreview(); setHoveredTurnId(id); }, [clearHidePreview]);
	const scheduleHidePreview = useCallback(() => {
		clearHidePreview();
		hidePreviewTimeout.current = window.setTimeout(() => { setHoveredTurnId(null); hidePreviewTimeout.current = null; }, 120);
	}, [clearHidePreview]);
	const clearNavigation = useCallback(() => {
		if (navigationTimeout.current !== null) { window.clearTimeout(navigationTimeout.current); navigationTimeout.current = null; }
		setNavigatingTurnId(null);
	}, []);

	useEffect(() => () => clearHidePreview(), [clearHidePreview]);
	useEffect(() => () => { if (navigationTimeout.current !== null) window.clearTimeout(navigationTimeout.current); }, []);
	useEffect(() => {
		if (!navigatingTurnId || currentAnchorId !== navigatingTurnId) return;
		const frame = window.requestAnimationFrame(() => clearNavigation());
		return () => window.cancelAnimationFrame(frame);
	}, [clearNavigation, currentAnchorId, navigatingTurnId]);
	useEffect(() => {
		const element = viewport.current;
		if (!element) return;
		element.addEventListener("scrollend", clearNavigation);
		return () => element.removeEventListener("scrollend", clearNavigation);
	}, [clearNavigation, viewport]);
	useEffect(() => {
		if (!activeTurnId || isHoverTransitionReady) return;
		const frame = window.requestAnimationFrame(() => setIsHoverTransitionReady(true));
		return () => window.cancelAnimationFrame(frame);
	}, [activeTurnId, isHoverTransitionReady]);

	if (turns.length < 3 || !scrollable) return null;

	const handleNavigate = (id: string) => {
		clearHidePreview();
		setHoveredTurnId(id);
		const element = viewport.current, node = element && turnElement(element, id);
		if (!element || !node) { clearNavigation(); return; }
		onNavigate?.();
		element.scrollTo({ top: element.scrollTop + node.getBoundingClientRect().top - element.getBoundingClientRect().top - 12, behavior: "smooth" });
		clearNavigation();
		setNavigatingTurnId(id);
		navigationTimeout.current = window.setTimeout(() => clearNavigation(), 2_000);
	};

	const previewTop = previewTurnIndex >= 0 ? Math.min(84, Math.max(14, ((previewTurnIndex + 0.5) / turns.length) * 100)) : 50;
	const markerGroupHeight = Math.min(280, Math.max(40, turns.length * 9 + 5));
	const markerTransitionClass = isHoverTransitionReady ? "transition-[width,height,background-color,opacity]" : "transition-[background-color,opacity]";
	const attachments = previewTurn ? attachmentLabel(previewTurn.attachments) : null;

	return <nav aria-label="Conversation navigation" className="pointer-events-none absolute inset-y-0 left-0 z-30 w-[min(32rem,100%)]">
		<div className="pointer-events-auto absolute inset-y-0 left-2 w-6">
			<div className="absolute top-1/2 left-0 w-6 -translate-y-1/2" style={{ height: `${markerGroupHeight}px` }} onPointerLeave={scheduleHidePreview}
				onBlurCapture={event => { const next = event.relatedTarget; if (!(next instanceof Node) || !event.currentTarget.contains(next)) scheduleHidePreview(); }}>
				{turns.map((turn, index) => {
					const isCurrent = currentAnchorId === turn.id;
					const hoverDistance = activeTurnIndex >= 0 ? Math.abs(index - activeTurnIndex) : Number.POSITIVE_INFINITY;
					const hoverWidth = HOVER_MARKER_WIDTHS[hoverDistance] ?? DEFAULT_MARKER_WIDTH;
					const isHovering = activeTurnIndex >= 0;
					return <button key={turn.id} type="button" aria-label={`Jump to message ${index + 1}: ${preview(turn.user)}`} aria-current={isCurrent ? "location" : undefined} title={preview(turn.user)}
						onPointerEnter={() => showPreview(turn.id)} onPointerDown={() => showPreview(turn.id)} onFocus={() => showPreview(turn.id)} onClick={() => handleNavigate(turn.id)}
						className="absolute left-0 flex h-2 w-6 -translate-y-1/2 items-center justify-start rounded-sm outline-none" style={{ top: `${((index + 0.5) / turns.length) * 100}%` }}>
						<span className={cn("block rounded-full duration-200 ease-out motion-reduce:transition-none", markerTransitionClass, markerClass(isCurrent, visibleIds.includes(turn.id), navigatingTurnId === turn.id, hoverDistance, isHovering))}
							style={{ width: isHovering ? `${hoverWidth}px` : "6px" }} />
					</button>;
				})}
				{previewTurn && <div className="pointer-events-auto absolute left-8 w-[min(28rem,calc(100vw-3.5rem))] -translate-y-1/2 rounded-2xl border border-border/80 bg-popover/95 px-3 py-2.5 text-popover-foreground shadow-xl backdrop-blur-md transition-[top,opacity,transform] duration-200 ease-out motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-1 motion-safe:duration-200 motion-reduce:animate-none motion-reduce:transition-none"
					style={{ top: `${previewTop}%` }} onPointerEnter={() => showPreview(previewTurn.id)} onPointerLeave={scheduleHidePreview}>
					<button type="button" aria-label={`Jump to message ${previewTurnIndex + 1}`} onPointerDown={() => showPreview(previewTurn.id)} onFocus={() => showPreview(previewTurn.id)} onClick={() => handleNavigate(previewTurn.id)}
						className="block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
						<div className="truncate text-sm font-medium text-foreground">{preview(previewTurn.user)}</div>
						{previewTurn.assistant !== undefined && <div className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{preview(previewTurn.assistant)}</div>}
						{attachments && <div className="mt-2 flex min-w-0 items-center gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground"><FileText className="size-3.5 shrink-0" /><span className="truncate">{attachments}</span></div>}
					</button>
				</div>}
			</div>
		</div>
	</nav>;
}
