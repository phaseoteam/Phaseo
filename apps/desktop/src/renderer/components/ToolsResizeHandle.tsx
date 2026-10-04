import { useRef } from "react";

export function ToolsResizeHandle({ width, onChange }: { width: number; onChange: (width: number) => void }) {
	const drag = useRef<{ x: number; width: number } | undefined>(undefined);
	const maximum = () => Math.max(320, Math.min(900, window.innerWidth - 280));
	const resize = (value: number) => onChange(Math.round(Math.max(320, Math.min(maximum(), value))));
	return <div className="tools-resize-handle" role="separator" tabIndex={0} aria-label="Resize tools panel" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={maximum()} aria-valuenow={width}
		onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); drag.current = { x: event.clientX, width: event.currentTarget.parentElement!.getBoundingClientRect().width }; event.currentTarget.setPointerCapture(event.pointerId); }}
		onPointerMove={event => { if (drag.current) resize(drag.current.width + drag.current.x - event.clientX); }}
		onPointerUp={event => { drag.current = undefined; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
		onLostPointerCapture={() => { drag.current = undefined; }}
		onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); resize(event.key === "Home" ? 320 : event.key === "End" ? maximum() : width + (event.key === "ArrowLeft" ? 20 : -20)); }} />;
}
