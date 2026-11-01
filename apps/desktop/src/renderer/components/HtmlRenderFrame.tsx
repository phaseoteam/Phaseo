import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { htmlRenderLimits, htmlRenderUrl, type HtmlRenderActivity } from "../../shared/htmlRender";

const watchTheme = (listener: () => void) => { const observer = new MutationObserver(listener); observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] }); return () => observer.disconnect(); };
const useDark = () => useSyncExternalStore(watchTheme, () => document.documentElement.classList.contains("dark"), () => true);

/** One frame of the page: scripts run, but on no origin of the app's, with no popups, forms or top navigation. */
function Frame({ src, title, className, style, onHeight }: { src: string; title: string; className: string; style?: CSSProperties; onHeight?: (height: number) => void }) {
	const frame = useRef<HTMLIFrameElement>(null);
	useEffect(() => {
		if (!onHeight) return;
		// Only this frame's own window may size it.
		const listen = (event: MessageEvent) => {
			if (event.source !== frame.current?.contentWindow) return;
			const value = (event.data as { phaseoHtmlHeight?: unknown } | null)?.phaseoHtmlHeight;
			if (typeof value === "number" && Number.isFinite(value) && value > 0) onHeight(Math.ceil(value));
		};
		window.addEventListener("message", listen);
		return () => window.removeEventListener("message", listen);
	}, [onHeight]);
	return <iframe ref={frame} src={src} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" className={className} style={style} />;
}

/** A page an agent showed with html_render, above its reply and sized to the page; it opens full screen. */
export function HtmlRenderFrame({ html, render }: { html: string; render: HtmlRenderActivity }) {
	const dark = useDark();
	const src = useMemo(() => htmlRenderUrl(html, dark ? "dark" : "light"), [html, dark]);
	const [reported, setReported] = useState<number>();
	const [expanded, setExpanded] = useState(false);
	// The page's own height wins over the agent's estimate, within a bound so a page that grows with its frame stops.
	const height = Math.min(reported ?? render.height, htmlRenderLimits.maxHeight * 4);
	return <figure className="group/html relative m-0" aria-label={render.title}>
		<Frame src={src} title={render.title} className="block w-full border-0 bg-transparent" style={{ height }} onHeight={setReported} />
		<button type="button" aria-label={`Open ${render.title} full screen`} title="Open full screen" onClick={() => setExpanded(true)} className="absolute top-2 right-2 rounded-md bg-background/80 p-1 text-muted-foreground opacity-0 transition-opacity group-hover/html:opacity-100 focus-visible:opacity-100 hover:text-foreground">
			<Maximize2 className="size-3.5" />
		</button>
		<Dialog open={expanded} onOpenChange={setExpanded}>
			<DialogContent className="flex h-[90vh] max-w-[95vw] flex-col gap-2 p-3 sm:max-w-[95vw]">
				<DialogTitle className="text-[13px] font-medium">{render.title}</DialogTitle>
				{expanded && <Frame src={src} title={render.title} className="min-h-0 w-full flex-1 border-0 bg-background" />}
			</DialogContent>
		</Dialog>
	</figure>;
}
