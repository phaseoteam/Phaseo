import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { htmlRenderLimits, htmlRenderUrl, type HtmlRenderActivity } from "../../shared/htmlRender";
import { mcpAppReply, type McpAppCall } from "./mcpAppHost";

const watchTheme = (listener: () => void) => { const observer = new MutationObserver(listener); observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] }); return () => observer.disconnect(); };
const useDark = () => useSyncExternalStore(watchTheme, () => document.documentElement.classList.contains("dark"), () => true);

/** One frame of the page: scripts run, but on no origin of the app's, with no popups, forms or top navigation. */
function Frame({ src, title, className, style, onHeight, mcpApp, theme }: { src: string; title: string; className: string; style?: CSSProperties; onHeight?: (height: number) => void; mcpApp?: McpAppCall; theme: "light" | "dark" }) {
	const frame = useRef<HTMLIFrameElement>(null);
	useEffect(() => {
		if (!onHeight && !mcpApp) return;
		// Only this frame's own window may size it or talk to it.
		const listen = (event: MessageEvent) => {
			const target = frame.current?.contentWindow;
			if (!target || event.source !== target) return;
			const value = (event.data as { phaseoHtmlHeight?: unknown } | null)?.phaseoHtmlHeight;
			if (typeof value === "number" && Number.isFinite(value) && value > 0) { onHeight?.(Math.ceil(value)); return; }
			if (!mcpApp) return;
			const { replies, height } = mcpAppReply(event.data as never, mcpApp, theme);
			for (const reply of replies) target.postMessage(reply, "*");
			if (height) onHeight?.(height);
		};
		window.addEventListener("message", listen);
		return () => window.removeEventListener("message", listen);
	}, [onHeight, mcpApp, theme]);
	return <iframe ref={frame} src={src} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" className={className} style={style} />;
}

/** A page an agent showed with html_render, above its reply and sized to the page; it opens full screen. */
export function HtmlRenderFrame({ html, render, mcpApp }: { html: string; render: HtmlRenderActivity; mcpApp?: McpAppCall }) {
	const dark = useDark();
	const src = useMemo(() => htmlRenderUrl(html, dark ? "dark" : "light"), [html, dark]);
	const [reported, setReported] = useState<number>();
	const [expanded, setExpanded] = useState(false);
	// The page's own height wins over the agent's estimate, within a bound so a page that grows with its frame stops.
	const height = Math.min(reported ?? render.height, htmlRenderLimits.maxHeight * 4);
	return <figure className="group/html relative m-0" aria-label={render.title}>
		<Frame src={src} title={render.title} className="block w-full border-0 bg-transparent" style={{ height }} onHeight={setReported} mcpApp={mcpApp} theme={dark ? "dark" : "light"} />
		<button type="button" aria-label={`Open ${render.title} full screen`} title="Open full screen" onClick={() => setExpanded(true)} className="absolute top-2 right-2 rounded-md bg-background/80 p-1 text-muted-foreground opacity-0 transition-opacity group-hover/html:opacity-100 focus-visible:opacity-100 hover:text-foreground">
			<Maximize2 className="size-3.5" />
		</button>
		<Dialog open={expanded} onOpenChange={setExpanded}>
			<DialogContent className="flex h-[90vh] max-w-[95vw] flex-col gap-2 p-3 sm:max-w-[95vw]">
				<DialogTitle className="text-[13px] font-medium">{render.title}</DialogTitle>
				{expanded && <Frame src={src} title={render.title} className="min-h-0 w-full flex-1 border-0 bg-background" mcpApp={mcpApp} theme={dark ? "dark" : "light"} />}
			</DialogContent>
		</Dialog>
	</figure>;
}
