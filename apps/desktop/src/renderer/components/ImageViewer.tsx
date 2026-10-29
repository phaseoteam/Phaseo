import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Minus, Plus, X } from "lucide-react";
import { cn } from "../lib/utils";

export type GalleryImage = { src: string; alt: string; /** A web address to open in the browser. */ href?: string };

const maxZoom = 8;
export const clampZoom = (value: number) => Math.min(maxZoom, Math.max(1, value));

/**
 * Zoom keeps the point under the pointer still: the offset scales with the zoom around that point. Offsets are in
 * screen pixels from the centred, fitted image.
 */
export function zoomAround(zoom: number, offset: { x: number; y: number }, next: number, point: { x: number; y: number }) {
	const clamped = clampZoom(next);
	if (clamped === 1) return { zoom: 1, offset: { x: 0, y: 0 } };
	const ratio = clamped / zoom;
	return { zoom: clamped, offset: { x: point.x - (point.x - offset.x) * ratio, y: point.y - (point.y - offset.y) * ratio } };
}

/** One image, fitted to the window: the wheel and the buttons zoom, dragging pans, double-click toggles 2×. */
function ZoomableImage({ image }: { image: GalleryImage }) {
	const frame = useRef<HTMLDivElement>(null);
	const [view, setView] = useState({ zoom: 1, offset: { x: 0, y: 0 } });
	const drag = useRef<{ id: number; x: number; y: number; from: { x: number; y: number } } | undefined>(undefined);
	const [failed, setFailed] = useState(false);
	const centre = (clientX: number, clientY: number) => { const bounds = frame.current!.getBoundingClientRect(); return { x: clientX - bounds.left - bounds.width / 2, y: clientY - bounds.top - bounds.height / 2 }; };
	useEffect(() => {
		const element = frame.current;
		if (!element) return;
		// React's wheel listener is passive, so it cannot keep the page from scrolling.
		const wheel = (event: WheelEvent) => { event.preventDefault(); const point = centre(event.clientX, event.clientY); setView(current => zoomAround(current.zoom, current.offset, current.zoom * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002)), point)); };
		element.addEventListener("wheel", wheel, { passive: false });
		return () => element.removeEventListener("wheel", wheel);
	}, []);
	const step = (factor: number) => setView(current => zoomAround(current.zoom, current.offset, current.zoom * factor, { x: 0, y: 0 }));
	return <div className="flex min-h-0 flex-1 flex-col">
		<div ref={frame} data-zoom={view.zoom > 1 ? "" : undefined} className={cn("relative grid min-h-0 flex-1 place-items-center overflow-hidden", view.zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in")}
			onDoubleClick={event => { const point = centre(event.clientX, event.clientY); setView(current => current.zoom > 1 ? { zoom: 1, offset: { x: 0, y: 0 } } : zoomAround(1, { x: 0, y: 0 }, 2, point)); }}
			onPointerDown={event => { if (view.zoom <= 1 || event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, from: view.offset }; }}
			onPointerMove={event => { const start = drag.current; if (start?.id !== event.pointerId) return; setView(current => ({ ...current, offset: { x: start.from.x + event.clientX - start.x, y: start.from.y + event.clientY - start.y } })); }}
			onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }}>
			{failed
				? <p role="alert" className="text-sm text-muted-foreground">This image could not be loaded.</p>
				: <img src={image.src} alt={image.alt} draggable={false} onError={() => setFailed(true)} style={{ transform: `translate(${view.offset.x}px, ${view.offset.y}px) scale(${view.zoom})` }}
					className="max-h-full max-w-full object-contain select-none" />}
		</div>
		<div className="flex shrink-0 items-center justify-center gap-1 pt-3 text-xs text-muted-foreground">
			<ViewerButton label="Zoom out" disabled={view.zoom <= 1} onClick={() => step(1 / 1.5)}><Minus /></ViewerButton>
			<button type="button" onClick={() => setView({ zoom: 1, offset: { x: 0, y: 0 } })} title="Fit to window" className="h-7 min-w-14 rounded-md px-2 font-mono tabular-nums hover:bg-muted hover:text-foreground">{Math.round(view.zoom * 100)}%</button>
			<ViewerButton label="Zoom in" disabled={view.zoom >= maxZoom} onClick={() => step(1.5)}><Plus /></ViewerButton>
		</div>
	</div>;
}

function ViewerButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
	return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 [&_svg]:size-4">{children}</button>;
}

/** T3's expanded image: the whole window, arrow keys step through the message's images, Escape closes. */
export function ImageViewer({ images, index: initial, onClose }: { images: GalleryImage[]; index: number; onClose: () => void }) {
	const dialog = useRef<HTMLDialogElement>(null);
	const [index, setIndex] = useState(Math.min(Math.max(0, initial), images.length - 1));
	const image = images[index];
	useEffect(() => {
		const element = dialog.current, trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
		element?.showModal();
		return () => { element?.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
	}, []);
	const move = (by: number) => setIndex(current => (current + by + images.length) % images.length);
	const keys = (event: ReactKeyboardEvent) => {
		if (images.length < 2) return;
		if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
		if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
	};
	if (!image) return null;
	return <dialog ref={dialog} aria-label={image.alt || "Image"} onKeyDown={keys} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}
		className="image-viewer m-auto flex h-[calc(100vh-48px)] max-h-none w-[calc(100vw-48px)] max-w-none flex-col rounded-md border border-border bg-background p-3 text-foreground backdrop:bg-black/70">
		<header className="flex shrink-0 items-center gap-2 pb-2 text-[13px]">
			<span className="min-w-0 flex-1 truncate font-medium">{image.alt || "Image"}</span>
			{images.length > 1 && <span className="text-xs text-muted-foreground tabular-nums">{index + 1} of {images.length}</span>}
			{image.href && <ViewerButton label="Open in browser" onClick={() => void window.phaseoDesktop?.workspace.openLink(image.href!)}><ExternalLink /></ViewerButton>}
			<ViewerButton label="Close" onClick={onClose}><X /></ViewerButton>
		</header>
		<div className="relative flex min-h-0 flex-1">
			<ZoomableImage key={image.src} image={image} />
			{images.length > 1 && <>
				<button type="button" aria-label="Previous image" onClick={() => move(-1)} className="absolute top-1/2 left-1 grid size-8 -translate-y-1/2 place-items-center rounded-md bg-background/80 text-muted-foreground hover:text-foreground"><ChevronLeft className="size-5" /></button>
				<button type="button" aria-label="Next image" onClick={() => move(1)} className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md bg-background/80 text-muted-foreground hover:text-foreground"><ChevronRight className="size-5" /></button>
			</>}
		</div>
	</dialog>;
}
