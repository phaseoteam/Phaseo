import { useRef } from "react";

export function ToolsResizeHandle({ width, onChange, onExpand, onClose, onRestore }: { width: number; onChange: (width: number) => void; onExpand: () => void; onClose: () => void; onRestore: () => void }) {
	const drag = useRef<{ x: number; width: number } | undefined>(undefined);
	const handle = useRef<HTMLDivElement>(null);
	const maximum = () => {
		const shell = handle.current?.closest(".chat-shell");
		const sidebar = shell?.querySelector(".task-list")?.getBoundingClientRect().width ?? 246;
		return Math.max(320, Math.min(900, (shell?.clientWidth ?? window.innerWidth) - sidebar - 320));
	};
	const resize = (value: number) => onChange(Math.round(Math.max(320, Math.min(maximum(), value))));
	return <div ref={handle} className="tools-resize-handle" role="separator" tabIndex={0} aria-label="Resize tools panel" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={maximum()} aria-valuenow={Math.min(width, maximum())}
		onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); drag.current = { x: event.clientX, width: event.currentTarget.parentElement!.getBoundingClientRect().width }; event.currentTarget.setPointerCapture(event.pointerId); }}
		onPointerMove={event => { if (drag.current) { const raw = drag.current.width + drag.current.x - event.clientX; if (raw < 180) { drag.current = undefined; onClose(); } else if (raw > maximum() + 64) onExpand(); else { onRestore(); resize(raw); } } }}
		onPointerUp={event => { if (drag.current) { const raw = drag.current.width + drag.current.x - event.clientX; if (raw < 180) onClose(); else if (raw > maximum() + 64) onExpand(); else onRestore(); } drag.current = undefined; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
		onLostPointerCapture={() => { drag.current = undefined; }}
		onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const current = event.currentTarget.parentElement!.getBoundingClientRect().width; resize(event.key === "Home" ? 320 : event.key === "End" ? maximum() : current + (event.key === "ArrowLeft" ? 20 : -20)); }} />;
}
