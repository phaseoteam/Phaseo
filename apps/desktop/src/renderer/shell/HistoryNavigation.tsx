import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useWorkspace } from "../app/workspace";
import { useCommand } from "../lib/keybindings";
import { cn } from "../lib/utils";

export type Direction = "back" | "forward";
const TRIGGER_DISTANCE = 120;
// First events are often diagonal, so the gesture picks an axis only after this much movement.
const AXIS_LOCK_DISTANCE = 8;
// Without a "fingers lifted" event, a pause in the wheel events ends the gesture.
const GESTURE_GAP_MS = 180;

export type Swipe = { kind: "pending"; target: EventTarget | null; y: number; sumX: number; sumY: number } | { kind: "tracking"; direction: Direction; distance: number; y: number } | { kind: "ignored" };

/** Swipes inside a dialog, or over something that scrolls sideways, belong to it. */
function keepsSwipe(target: EventTarget | null, deltaX: number) {
	if (target instanceof Element && target.closest('[role="dialog"]')) return true;
	for (let element = target instanceof Element ? target : null; element; element = element.parentElement) {
		if (element.scrollWidth <= element.clientWidth) continue;
		const { overflowX } = getComputedStyle(element);
		if (overflowX !== "auto" && overflowX !== "scroll") continue;
		if (deltaX < 0 ? element.scrollLeft > 0 : element.scrollLeft + element.clientWidth < element.scrollWidth - 1) return true;
	}
	return false;
}

/**
 * One wheel event of a two-finger trackpad swipe. A mostly horizontal swipe over nothing that scrolls sideways
 * tracks towards back (left) or forward (right); anything else is left alone.
 */
export function swipeStep(gesture: Swipe | null, event: { deltaX: number; deltaY: number; ctrlKey: boolean; pixels: boolean; target: EventTarget | null; y: number }, can: (direction: Direction) => boolean, keeps = keepsSwipe): Swipe {
	let next: Swipe = gesture ?? (event.ctrlKey || !event.pixels ? { kind: "ignored" } : { kind: "pending", target: event.target, y: event.y, sumX: 0, sumY: 0 });
	if (next.kind === "ignored") return next;
	if (next.kind === "tracking") return { ...next, distance: Math.max(0, next.distance + (next.direction === "back" ? -event.deltaX : event.deltaX)) };
	next = { ...next, sumX: next.sumX + event.deltaX, sumY: next.sumY + event.deltaY };
	if (Math.abs(next.sumX) + Math.abs(next.sumY) < AXIS_LOCK_DISTANCE) return next;
	if (Math.abs(next.sumX) <= Math.abs(next.sumY)) return { kind: "ignored" };
	if (keeps(next.target, next.sumX)) return { kind: "ignored" };
	const direction: Direction = next.sumX < 0 ? "back" : "forward";
	return can(direction) ? { kind: "tracking", direction, distance: Math.abs(next.sumX), y: next.y } : { kind: "ignored" };
}

/**
 * Back and forward through chats and pages: Mod+[ and Mod+], the mouse's side buttons, macOS swipes and a two-finger
 * trackpad swipe, which shows an arrow that fills in as the swipe gets far enough.
 */
export function HistoryNavigation() {
	const { history } = useWorkspace();
	const latest = useRef(history); latest.current = history;
	const [indicator, setIndicator] = useState<{ direction: Direction; progress: number; y: number }>();
	const go = (direction: Direction) => { const value = latest.current; if (direction === "back" ? !value.canBack : !value.canForward) return false; if (direction === "back") value.back(); else value.forward(); };
	useCommand("navigation.back", () => go("back"));
	useCommand("navigation.forward", () => go("forward"));
	useEffect(() => window.phaseoDesktop?.onNavigate(direction => { go(direction); }), []);
	useEffect(() => {
		let gesture: Swipe | null = null, timer: ReturnType<typeof setTimeout> | undefined;
		const can = (direction: Direction) => direction === "back" ? latest.current.canBack : latest.current.canForward;
		const release = () => {
			if (gesture?.kind === "tracking" && gesture.distance >= TRIGGER_DISTANCE) go(gesture.direction);
			gesture = null; setIndicator(undefined);
		};
		const onWheel = (event: WheelEvent) => {
			clearTimeout(timer); timer = setTimeout(release, GESTURE_GAP_MS);
			gesture = swipeStep(gesture, { deltaX: event.deltaX, deltaY: event.deltaY, ctrlKey: event.ctrlKey, pixels: event.deltaMode === WheelEvent.DOM_DELTA_PIXEL, target: event.target, y: event.clientY }, can);
			if (gesture.kind === "tracking") { const { direction, distance, y } = gesture; setIndicator({ direction, y, progress: Math.min(1, distance / TRIGGER_DISTANCE) }); }
		};
		// macOS sends the mouse's side buttons to the page rather than as window commands.
		const onMouse = (event: MouseEvent) => { if (window.phaseoDesktop?.platform === "darwin" && (event.button === 3 || event.button === 4)) { event.preventDefault(); go(event.button === 3 ? "back" : "forward"); } };
		window.addEventListener("wheel", onWheel, { capture: true, passive: true });
		window.addEventListener("mouseup", onMouse);
		return () => { clearTimeout(timer); window.removeEventListener("wheel", onWheel, { capture: true }); window.removeEventListener("mouseup", onMouse); };
	}, []);
	if (!indicator) return null;
	const Icon = indicator.direction === "back" ? ArrowLeft : ArrowRight, armed = indicator.progress >= 1;
	return <div aria-hidden className={cn("pointer-events-none fixed z-100 grid size-10 place-items-center rounded-md border border-border bg-popover text-foreground shadow-md", indicator.direction === "back" ? "left-2" : "right-2")}
		style={{ top: `clamp(48px, ${indicator.y - 20}px, calc(100% - 48px))`, opacity: 0.35 + indicator.progress * 0.65, transform: `translateX(${(indicator.direction === "back" ? -1 : 1) * (1 - indicator.progress) * 24}px)` }}>
		<Icon className={cn("size-4", !armed && "opacity-50")} />
	</div>;
}
