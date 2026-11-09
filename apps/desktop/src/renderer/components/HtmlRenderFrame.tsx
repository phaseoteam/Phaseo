import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { htmlRenderLimits, htmlRenderUrl, type HtmlRenderActivity } from "../../shared/htmlRender";
import { mcpAppReply, type McpAppCall, type McpAppHostActions } from "./mcpAppHost";
import { askConsent } from "./ConsentDialog";
import { showToast } from "./ui/toast";
import { setAppContext } from "../lib/mcpAppContext";
import { appStyleVariables, usePageTheme } from "./pageTheme";

const watchTheme = (listener: () => void) => { const observer = new MutationObserver(listener); observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] }); return () => observer.disconnect(); };
const useDark = () => useSyncExternalStore(watchTheme, () => document.documentElement.classList.contains("dark"), () => true);

/** Where an MCP App page lives, so its requests reach its own server and its own chat. */
export type McpAppPlace = { taskId: string; activityId: string };

/** The person is using this frame: it has focus, which only a click or key in it gives. Pages act only then. */
const using = (frame: HtmlIFrameElement | null) => Boolean(frame && document.activeElement === frame);
type HtmlIFrameElement = HTMLIFrameElement;

/**
 * One frame of the page: scripts run, but on no origin of the app's, with no popups, forms or top navigation. Links the
 * person clicks open in the browser; an MCP App also gets its host.
 */
function Frame({ src, title, className, style, onHeight, mcpApp, place, theme, styles, zoom = 1, onFullscreen }: { src: string; title: string; className: string; style?: CSSProperties; onHeight?: (height: number) => void; mcpApp?: McpAppCall; place?: McpAppPlace; theme: "light" | "dark"; styles?: Record<string, string>; zoom?: number; onFullscreen?: (on: boolean) => boolean }) {
	const frame = useRef<HtmlIFrameElement>(null);
	useEffect(() => {
		const api = window.phaseoDesktop?.workspace;
		const host: McpAppHostActions | undefined = mcpApp && place && api ? {
			theme, ...styles ? { styles } : {},
			callTool: async (name, input) => {
				const tool = await api.mcpAppTool(place.taskId, place.activityId, name);
				if (!tool.readOnly && !await askConsent({ title: `Let ${title} run ${tool.title ?? tool.name}?`, description: tool.description ?? "The app wants to run a tool on its own MCP server.", detail: JSON.stringify(input, null, 2), confirm: "Run it" })) throw new Error("The person did not allow this tool.");
				return api.mcpAppCall(place.taskId, place.activityId, name, input);
			},
			sendMessage: async body => {
				if (!await askConsent({ title: `Send this message from ${title}?`, description: "The app wants to post it in this chat as you.", detail: body, confirm: "Send" })) return false;
				return Boolean(await api.command({ type: "send", id: place.taskId, text: body }));
			},
			setContext: body => setAppContext(place.taskId, place.activityId, title, body),
			openLink: async url => using(frame.current) && api.openPageLink(url),
			requestFullscreen: on => onFullscreen?.(on && using(frame.current)) ? "fullscreen" : "inline",
		} : undefined;
		const listen = (event: MessageEvent) => {
			const target = frame.current?.contentWindow;
			if (!target || event.source !== target) return;
			const data = event.data as { phaseoHtmlHeight?: unknown; phaseoOpenLink?: unknown } | null;
			const value = data?.phaseoHtmlHeight;
			if (typeof value === "number" && Number.isFinite(value) && value > 0) { onHeight?.(Math.ceil(value)); return; }
			// A link the person clicked in the page (the page reports it; it cannot navigate itself).
			if (typeof data?.phaseoOpenLink === "string") { if (using(frame.current)) void api?.openPageLink(data.phaseoOpenLink).then(opened => { if (!opened) showToast("error", "Only web links open from a page"); }); return; }
			if (!host) return;
			void mcpAppReply(event.data as never, mcpApp!, host).then(({ replies, height }) => {
				for (const reply of replies) frame.current?.contentWindow?.postMessage(reply, "*");
				if (height) onHeight?.(height);
			});
		};
		window.addEventListener("message", listen);
		return () => window.removeEventListener("message", listen);
	}, [onHeight, mcpApp, place, theme, styles, title, onFullscreen]);
	// The zoom controls scale the page itself, which then reports its new height.
	useEffect(() => { frame.current?.contentWindow?.postMessage({ phaseoHtmlZoom: zoom }, "*"); }, [zoom]);
	return <iframe ref={frame} onLoad={() => { if (zoom !== 1) frame.current?.contentWindow?.postMessage({ phaseoHtmlZoom: zoom }, "*"); }} src={src} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" className={className} style={style} />;
}

/** A page an agent showed with html_render, or an MCP App, sized to the page; it opens full screen. */
export function HtmlRenderFrame({ html, render, mcpApp, place }: { html: string; render: HtmlRenderActivity; mcpApp?: McpAppCall; place?: McpAppPlace }) {
	const dark = useDark(), pageTheme = usePageTheme(), themeKey = JSON.stringify(pageTheme);
	// The page follows the window's colours, custom themes included; a change reloads it in them.
	const src = useMemo(() => htmlRenderUrl(html, dark ? "dark" : "light", JSON.parse(themeKey)), [html, dark, themeKey]);
	const styles = useMemo(() => appStyleVariables(JSON.parse(themeKey)), [themeKey]);
	const [zoom, setZoom] = useState(1);
	const step = (by: number) => setZoom(current => Math.min(2, Math.max(0.5, Math.round((current + by) * 10) / 10)));
	const [reported, setReported] = useState<number>();
	const [expanded, setExpanded] = useState(false);
	// The page's own height wins over the agent's estimate, within a bound so a page that grows with its frame stops.
	const height = Math.min(reported ?? render.height, htmlRenderLimits.maxHeight * 4);
	const theme = dark ? "dark" : "light";
	const fullscreen = useMemo(() => (on: boolean) => { setExpanded(on); return on; }, []);
	return <figure className="group/html relative m-0" aria-label={render.title} data-html-page={mcpApp ? "app" : "page"}>
		<Frame src={src} title={render.title} className="block w-full border-0 bg-transparent" style={{ height }} onHeight={setReported} mcpApp={mcpApp} place={place} theme={theme} styles={styles} zoom={zoom} onFullscreen={fullscreen} />
		<div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-md bg-background/80 p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/html:opacity-100 focus-within:opacity-100">
			<button type="button" aria-label={`Zoom out of ${render.title}`} title="Zoom out" disabled={zoom <= 0.5} onClick={() => step(-0.1)} className="press-squish rounded p-1 hover:text-foreground disabled:opacity-40"><ZoomOut className="size-3.5" /></button>
			{zoom !== 1 && <button type="button" aria-label="Reset zoom" title="Reset zoom" onClick={() => setZoom(1)} className="rounded px-1 text-[11px] tabular-nums hover:text-foreground">{Math.round(zoom * 100)}%</button>}
			<button type="button" aria-label={`Zoom in on ${render.title}`} title="Zoom in" disabled={zoom >= 2} onClick={() => step(0.1)} className="press-squish rounded p-1 hover:text-foreground disabled:opacity-40"><ZoomIn className="size-3.5" /></button>
			<button type="button" aria-label={`Open ${render.title} full screen`} title="Open full screen" onClick={() => setExpanded(true)} className="press-squish rounded p-1 hover:text-foreground"><Maximize2 className="size-3.5" /></button>
		</div>
		<Dialog open={expanded} onOpenChange={setExpanded}>
			<DialogContent className="flex h-[90vh] max-w-[95vw] flex-col gap-2 p-3 sm:max-w-[95vw]">
				<DialogTitle className="text-[13px] font-medium">{render.title}</DialogTitle>
				{expanded && <Frame src={src} title={render.title} className="min-h-0 w-full flex-1 border-0 bg-background" mcpApp={mcpApp} place={place} theme={theme} styles={styles} zoom={zoom} />}
			</DialogContent>
		</Dialog>
	</figure>;
}
