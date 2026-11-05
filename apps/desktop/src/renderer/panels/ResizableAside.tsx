import { useRef, useState, type ReactNode } from "react";
import { usePersistedState } from "../lib/persistedState";

const clampWidth = (value: number, min: number) => Math.round(Math.min(Math.max(value, min), 1200));

/**
 * A side column whose left edge drags to resize it: the width is remembered, double-clicking the edge restores the
 * default, and the arrow keys move it when the edge has focus. CSS keeps it to `maxShare` of the pane however wide.
 */
export function ResizableAside({ storageKey, defaultWidth, min, maxShare, label, className, children }: { storageKey: string; defaultWidth: number; min: number; maxShare: number; label: string; className?: string; children: ReactNode }) {
	const [saved, setSaved] = usePersistedState<number>(storageKey, defaultWidth);
	const [dragged, setDragged] = useState<number>();
	const aside = useRef<HTMLElement>(null), drag = useRef<{ x: number; width: number }>(undefined);
	const width = clampWidth(dragged ?? (Number.isFinite(saved) ? saved : defaultWidth), min);
	const finish = () => { if (dragged !== undefined) setSaved(dragged); drag.current = undefined; setDragged(undefined); };
	return <aside ref={aside} data-resizable-aside={storageKey} style={{ width, minWidth: min, maxWidth: `${maxShare * 100}%` }} className={`relative flex min-h-0 shrink-0 border-l border-border/60 bg-background ${className ?? ""}`}>
		<div role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={width} aria-valuemin={min} tabIndex={0} title="Drag to resize. Double-click to reset."
			onPointerDown={event => { drag.current = { x: event.clientX, width: aside.current?.offsetWidth ?? width }; event.currentTarget.setPointerCapture(event.pointerId); }}
			onPointerMove={event => { if (drag.current) setDragged(clampWidth(drag.current.width + drag.current.x - event.clientX, min)); }}
			onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
			onDoubleClick={() => { setDragged(undefined); setSaved(defaultWidth); }}
			onKeyDown={event => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); setSaved(clampWidth((aside.current?.offsetWidth ?? width) + (event.key === "ArrowLeft" ? 24 : -24), min)); }}
			className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize outline-none select-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 hover:after:bg-ring/60 focus-visible:after:bg-ring" />
		{children}
	</aside>;
}
