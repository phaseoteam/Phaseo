import { useRef, useState, type PointerEvent, type RefObject } from "react";

/** The nearest ancestor that scrolls, for scrolling while an item is dragged near its edge. */
function scroller(element: HTMLElement | null) {
	for (let current = element; current; current = current.parentElement) if (current.scrollHeight > current.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(current).overflowY)) return current;
	return document.scrollingElement as HTMLElement | null;
}

/**
 * Reordering a vertical list by dragging with the pointer, not the browser's drag and drop (which stops the wheel and
 * never scrolls): the wheel keeps working, holding near the list's top or bottom edge scrolls it, and `drag.over` is the
 * gap the item would land in. Items are the elements in `list` matching `items`. With `threshold`, a press only becomes
 * a drag once the pointer moves that far, so the item can still be clicked.
 */
export function usePointerReorder({ list, items, onDrop, threshold = 0 }: { list: RefObject<HTMLElement | null>; items: (id: string) => string; onDrop: (id: string, index: number) => void; threshold?: number }) {
	const [drag, setDrag] = useState<{ id: string; over: number }>();
	const latest = useRef({ items, onDrop }); latest.current = { items, onDrop };
	const dragged = useRef(false);
	const start = (event: PointerEvent<HTMLElement>, id: string) => {
		if (event.button !== 0) return;
		if (!threshold) event.preventDefault();
		const area = scroller(list.current);
		const startY = event.clientY;
		let pointerY = startY, over = -1, frame = 0, active = !threshold;
		dragged.current = false;
		const elements = () => Array.from(list.current?.querySelectorAll<HTMLElement>(latest.current.items(id)) ?? []);
		const from = () => elements().findIndex(element => element.dataset.reorderId === id);
		const measure = () => {
			const rects = elements().map(element => element.getBoundingClientRect());
			const index = rects.findIndex(rect => pointerY < rect.top + rect.height / 2);
			over = index < 0 ? rects.length : index;
			setDrag({ id, over });
		};
		const tick = () => {
			if (area) {
				const box = area === document.scrollingElement ? { top: 0, bottom: innerHeight } : area.getBoundingClientRect(), edge = Math.min(48, (box.bottom - box.top) / 4);
				if (pointerY < box.top + edge) area.scrollTop -= Math.ceil((box.top + edge - pointerY) / 4);
				else if (pointerY > box.bottom - edge) area.scrollTop += Math.ceil((pointerY - box.bottom + edge) / 4);
			}
			measure(); frame = requestAnimationFrame(tick);
		};
		const begin = () => { active = true; dragged.current = true; frame = requestAnimationFrame(tick); };
		const move = (next: globalThis.PointerEvent) => { pointerY = next.clientY; if (!active && Math.abs(pointerY - startY) >= threshold) begin(); };
		const stop = (finished: globalThis.PointerEvent) => {
			cancelAnimationFrame(frame); removeEventListener("pointermove", move, true); removeEventListener("pointerup", stop, true); removeEventListener("pointercancel", stop, true);
			const was = from();
			// The gap counts the dragged item too; it leaves its old place first.
			if (active && finished.type === "pointerup" && over >= 0 && over !== was && over !== was + 1) latest.current.onDrop(id, over > was ? over - 1 : over);
			setDrag(undefined);
		};
		// Captured, so a popover around the list that stops these events on their way up doesn't strand the drag.
		addEventListener("pointermove", move, true); addEventListener("pointerup", stop, true); addEventListener("pointercancel", stop, true);
		if (active) begin();
	};
	/** True right after a drag, so the click that ends it doesn't also pick the item. */
	const consumeDrag = () => { const was = dragged.current; dragged.current = false; return was; };
	return { drag, start, consumeDrag };
}
