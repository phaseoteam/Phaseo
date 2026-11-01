import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { browserDeviceFrame, browserDeviceToolbarHeight, browserResizeRail, browserViewportLimits, planBrowserCrashRecovery, resizeBrowserViewport, stepBrowserZoom, type BrowserCommand, type BrowserCrashRecovery, type BrowserResizeDirection, type BrowserState, type BrowserViewport } from "../../shared/browser";
import type { BrowserDownload, BrowserDownloadCommand } from "../../shared/browserDownloads";
import { useWorkspace } from "../app/workspace";
import { BrowserChromeRow } from "../components/browser/BrowserChromeRow";
import { BrowserDeviceToolbar } from "../components/browser/BrowserDeviceToolbar";
import { BrowserMoreMenu } from "../components/browser/BrowserMoreMenu";
import { BrowserEmptyState, BrowserPoppedOut, BrowserRecordingNotice, BrowserUnreachable } from "../components/browser/BrowserStates";
import { browserNavigationAddress, browserRecents, projectRecents, recordBrowserVisit, type BrowserRecent } from "../lib/browserHistory";
import { browserTabError, browserViewportToRestore, focusedBrowserTab, recordBrowserState, setFocusedBrowserTab, useBrowserTab } from "../lib/browserTabs";
import { closeMiniPlayer, markBrowserSurfaceShown, openMiniPlayer, useMiniPlayer } from "../lib/browserMiniPlayer";
import { revealLabel, startBrowserRecording, stopBrowserRecording, useBrowserRecording, type SavedBrowserRecording } from "../lib/browserRecording";
import { shortcut, useCommand } from "../lib/keybindings";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { BrowserDownloads } from "./BrowserDownloads";

type Device = Extract<BrowserViewport, { mode: "device" }>;
const errorText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
const pngFile = (base64: string, name: string) => new File([Uint8Array.from(atob(base64), character => character.charCodeAt(0))], name, { type: "image/png" });
/** Hands files and text to the open message composer; false when none is open. */
export function attachToComposer(detail: { files?: File[]; text?: string }) { const payload = { ...detail, handled: false }; window.dispatchEvent(new CustomEvent("phaseo:composer-attach", { detail: payload })); return payload.handled; }
export const overlayOpen = () => Array.from(document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"], [role="menu"], [role="listbox"]')).some(element => element.getClientRects().length > 0);

/** One browser tab, as one pane tab: a chrome row over a native page. */
export function BrowserSurface({ context, tabId, covered, requestedLink }: { context: string; tabId: string; covered: boolean; requestedLink?: { url: string; request: number } }) {
	const api = window.phaseoDesktop;
	const tab = useBrowserTab(context, tabId);
	const { overview, newChatProjectId, setRightPanel } = useWorkspace();
	const project = overview.tasks.find(task => task.id === context)?.projectId ?? (context === "draft" ? newChatProjectId : "") ?? "";
	const slot = useRef<HTMLDivElement>(null);
	const [slotSize, setSlotSize] = useState({ width: 0, height: 0 });
	const [state, setState] = useState<BrowserState>();
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [focusNonce, setFocusNonce] = useState(0);
	const [picking, setPicking] = useState(false);
	const [capturing, setCapturing] = useState(false);
	const recording = useBrowserRecording(tabId);
	const [saved, setSaved] = useState<SavedBrowserRecording>();
	const floating = useMiniPlayer(context)?.tabId === tabId;
	const [downloadsOpen, setDownloadsOpen] = useState(false);
	const [downloads, setDownloads] = useState<BrowserDownload[]>([]);
	const [aspectLocked, setAspectLocked] = useState(false);
	const [dragViewport, setDragViewport] = useState<Device>();
	const [storedRecents, setRecents] = usePersistedState<BrowserRecent[]>("phaseo.desktop.browser.recents", []);
	const recents = projectRecents(browserRecents(storedRecents), project);
	const restore = useRef(tab);
	const recovery = useRef<BrowserCrashRecovery>({ attempts: 0, since: null });
	const lastRecorded = useRef("");

	const send = useCallback(async (command: BrowserCommand) => { try { const result = await api?.browser(command); if (result?.id === tabId) { setState(result); recordBrowserState(result); } return result; } catch (reason) { setError(errorText(reason)); } }, [api, tabId]);
	const act = (type: "back" | "forward" | "reload" | "hardReload" | "stop" | "devtools") => { setError(""); void send({ id: tabId, type }); };
	const navigate = (url: string) => { setError(""); void send({ id: tabId, type: "navigate", url }); };
	const submit = (value: string) => { try { navigate(browserNavigationAddress(value)); } catch (reason) { setError(errorText(reason)); } };
	const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(current => current === message ? "" : current), 2500); };

	// Native state for this tab; a fresh native page takes the saved address, preview, zoom and colours.
	const applyState = useRef<(value?: BrowserState) => void>(() => undefined);
	useEffect(() => {
		if (!api) return;
		let restored = false;
		const apply = applyState.current = (value?: BrowserState) => {
			if (value?.id !== tabId) return;
			if (!restored) {
				restored = true;
				const saved = restore.current;
				if (saved && !value.configured) {
					// The address goes first, so the tab keeps it while the other settings apply.
					if (!value.url && saved.url) void send({ id: tabId, type: "navigate", url: saved.url });
					const viewport = browserViewportToRestore(value, saved.viewport);
					if (viewport.mode !== "fill") void send({ id: tabId, type: "viewport", viewport });
					if (saved.zoom && saved.zoom !== value.zoom) void send({ id: tabId, type: "zoom", zoom: saved.zoom });
					if (saved.colorScheme && saved.colorScheme !== value.colorScheme) void send({ id: tabId, type: "colorScheme", colorScheme: saved.colorScheme });
				}
			}
			setState(value);
			recordBrowserState(value);
			if (value.error) setError(value.error);
		};
		const unsubscribe = api.onBrowserState(apply);
		return () => { unsubscribe(); void api.browser({ type: "hide", id: tabId, slot: "pane" }).catch(() => undefined); };
	}, [api, tabId, send]);
	// While this tab shows here, its floating player steps aside.
	useEffect(() => markBrowserSurfaceShown(tabId), [tabId]);

	// The native page sits over the slot, and hides while anything covers it.
	useEffect(() => {
		const element = slot.current;
		if (!api || !element) return;
		let last = "", frame = 0;
		const hidden = covered || downloadsOpen;
		const place = () => {
			const rect = element.getBoundingClientRect();
			setSlotSize(current => current.width === rect.width && current.height === rect.height ? current : { width: rect.width, height: rect.height });
			if (hidden || overlayOpen()) { if (last !== "hidden") void api.browser({ type: "hide", id: tabId, slot: "pane" }).catch(() => undefined); last = "hidden"; return; }
			const signature = [rect.x, rect.y, rect.width, rect.height].join();
			if (signature === last) return;
			last = signature;
			void api.browser({ type: "show", id: tabId, slot: "pane", bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }).then(value => applyState.current(value), reason => setError(errorText(reason)));
		};
		const overlays = new MutationObserver(() => { place(); cancelAnimationFrame(frame); frame = requestAnimationFrame(place); });
		overlays.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style", "data-open", "data-closed"] });
		const observer = new ResizeObserver(place); observer.observe(element); window.addEventListener("resize", place); place();
		return () => { observer.disconnect(); overlays.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("resize", place); };
	// Coming back from a separate window, the page needs placing again.
	}, [api, tabId, covered, downloadsOpen, state?.poppedOut]);

	// This chat's downloads.
	useEffect(() => {
		let active = true;
		const mine = (values: BrowserDownload[]) => values.filter(item => item.sourceId === context || item.sourceId.startsWith(context + ":"));
		const unsubscribe = api?.onBrowserDownloads(values => { if (active) setDownloads(mine(values)); });
		void api?.browserDownload({ type: "list" }).then(values => { if (active) setDownloads(mine(values)); }, reason => { if (active) setError(errorText(reason)); });
		return () => { active = false; unsubscribe?.(); };
	}, [api, context]);
	const downloadAction = async (command: BrowserDownloadCommand) => { try { const values = await api?.browserDownload(command); if (values) setDownloads(values.filter(item => item.sourceId === context || item.sourceId.startsWith(context + ":"))); } catch (reason) { setError(errorText(reason)); } };

	// A link from the chat opens here.
	const lastLink = useRef<number | undefined>(undefined);
	useEffect(() => { if (requestedLink && requestedLink.request !== lastLink.current) { lastLink.current = requestedLink.request; navigate(requestedLink.url); } });

	// Pages that loaded join the project's recently used list.
	useEffect(() => {
		if (!state?.url || state.loading || state.failure || lastRecorded.current === state.url) return;
		lastRecorded.current = state.url;
		setRecents(values => recordBrowserVisit(values, { url: state.url, title: state.title || state.url, at: Date.now(), project, ...(state.favicon ? { favicon: state.favicon } : {}) }));
	}, [state?.url, state?.loading, state?.failure, state?.title, state?.favicon, project, setRecents]);

	// A crashed page reloads quietly, backing off.
	useEffect(() => {
		if (!state?.crashed) return;
		const plan = planBrowserCrashRecovery(recovery.current, Date.now());
		if (!plan) { setError("This page keeps crashing. Reload to try again."); return; }
		recovery.current = plan.state;
		const timer = window.setTimeout(() => void send({ id: tabId, type: "reload" }), plan.delay);
		return () => window.clearTimeout(timer);
	}, [state?.crashed, send, tabId]);

	const zoom = state?.zoom ?? tab?.zoom ?? 1;
	const setZoom = (value: number) => void send({ id: tabId, type: "zoom", zoom: value });
	const focused = () => focusedBrowserTab() === tabId;
	useCommand("browser.reload", () => { if (!focused() || !state?.url) return false; act("reload"); });
	useCommand("browser.focusUrl", () => { if (!focused()) return false; setFocusNonce(value => value + 1); });
	useCommand("browser.zoomIn", () => { if (!focused() || !state?.url) return false; setZoom(stepBrowserZoom(zoom, 1)); });
	useCommand("browser.zoomOut", () => { if (!focused() || !state?.url) return false; setZoom(stepBrowserZoom(zoom, -1)); });
	useCommand("browser.zoomReset", () => { if (!focused() || !state?.url) return false; setZoom(1); });

	const capture = async (record: boolean) => {
		if (!api) return;
		setError("");
		if (recording) {
			try { const result = await stopBrowserRecording(tabId); if (result) setSaved(result); } catch (reason) { setError(errorText(reason)); }
			return;
		}
		if (record) { try { await startBrowserRecording(tabId, url); setSaved(undefined); } catch (reason) { setError(errorText(reason)); } return; }
		setCapturing(true);
		try {
			const shot = await api.browserCapture(tabId);
			const added = attachToComposer({ files: [pngFile(shot.png, "screenshot.png")] });
			flash(added ? "Screenshot added to your message and copied." : "Screenshot copied to the clipboard.");
		} catch (reason) { setError(errorText(reason)); } finally { setCapturing(false); }
	};
	const pick = async () => {
		if (!api) return;
		if (picking) { void api.browserPick(tabId, true).catch(() => undefined); return; }
		setPicking(true); setError("");
		try {
			const result = await api.browserPick(tabId);
			if (!result) return;
			const text = `The <${result.tag}> element at \`${result.selector}\` on ${result.url}${result.text ? `: "${result.text.slice(0, 200)}"` : ""}`;
			flash(attachToComposer({ files: [pngFile(result.png, "element.png")], text }) ? "Element added to your message." : "Open a chat to add the element to a message.");
		} catch (reason) { setError(errorText(reason)); } finally { setPicking(false); }
	};

	const float = () => {
		if (floating) { closeMiniPlayer(context); return; }
		// Floating the page closes the panel; the page moves into the player over the chat.
		openMiniPlayer(context, tabId, slotSize);
		setRightPanel(undefined);
	};
	// Video is not a chat attachment, so the message gets the file's path.
	const attachRecording = (value: SavedBrowserRecording) => flash(attachToComposer({ text: "Screen recording of " + value.url + ": `" + value.path + "`" }) ? "Recording added to your message." : "Open a chat to add the recording to a message.");
	const url = state?.url ?? "";
	const viewport = dragViewport ?? state?.viewport ?? tab?.viewport ?? { mode: "fill" };
	const failure = state?.failure;
	// Blank until the saved address of a fresh page starts loading.
	const empty = !url && !failure && !state?.loading && !(tab?.url && !state?.configured);
	const device = viewport.mode === "device" && !empty && !failure ? viewport : undefined;
	const setViewport = (next: BrowserViewport) => { setDragViewport(undefined); void send({ id: tabId, type: "viewport", viewport: next }); };
	const toggleDeviceToolbar = () => {
		if (viewport.mode === "device") { setViewport({ mode: "fill" }); return; }
		const clamp = (value: number) => Math.min(browserViewportLimits.max, Math.max(browserViewportLimits.min, Math.round(value)));
		setViewport({ mode: "device", width: clamp(slotSize.width - browserResizeRail * 2), height: clamp(slotSize.height - browserDeviceToolbarHeight - browserResizeRail) });
	};
	// Device frame inside the slot, for the ring and the resize rails.
	const frame = device ? browserDeviceFrame({ x: 0, y: 0, width: slotSize.width, height: slotSize.height }, device) : undefined;
	const resizeStart = (direction: BrowserResizeDirection, event: ReactPointerEvent<HTMLElement>) => {
		if (!device || !frame) return;
		event.preventDefault();
		const target = event.currentTarget; target.setPointerCapture(event.pointerId);
		const start = { x: event.clientX, y: event.clientY }, from = device, ratio = aspectLocked ? device.width / device.height : undefined;
		let pending = 0, latest: Device = device;
		const move = (moveEvent: PointerEvent) => {
			const size = resizeBrowserViewport(from, { x: moveEvent.clientX - start.x, y: moveEvent.clientY - start.y }, frame.scale, direction, ratio);
			latest = { mode: "device", ...size };
			setDragViewport(latest);
			cancelAnimationFrame(pending); pending = requestAnimationFrame(() => void send({ id: tabId, type: "viewport", viewport: latest }));
		};
		const end = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", end); target.removeEventListener("pointercancel", end); cancelAnimationFrame(pending); setViewport(latest); };
		target.addEventListener("pointermove", move); target.addEventListener("pointerup", end); target.addEventListener("pointercancel", end);
	};
	const rail = (direction: BrowserResizeDirection, style: React.CSSProperties, cursor: string, label?: string) => <div key={direction} role={label ? "separator" : undefined} aria-label={label} aria-orientation={direction === "south" ? "horizontal" : "vertical"}
		className={cn("group absolute z-10 touch-none", cursor)} style={style} onPointerDown={event => resizeStart(direction, event)}>
		{label && <span aria-hidden className={cn("absolute top-1/2 left-1/2 -translate-1/2 rounded-full bg-muted-foreground/40 transition-colors group-hover:bg-foreground/70", direction === "south" ? "h-1 w-8" : "h-8 w-1")} />}
	</div>;
	const deviceTop = browserDeviceToolbarHeight;

	return <section className="browser-panel flex h-full min-h-0 flex-col bg-background" aria-label="Browser" data-browser-surface data-browser-tab-id={tabId} data-devtools-open={state?.devToolsOpen ? "true" : "false"}
		onFocusCapture={() => setFocusedBrowserTab(tabId)}
		onMouseUp={event => { if (event.button === 3 && state?.canGoBack) act("back"); if (event.button === 4 && state?.canGoForward) act("forward"); }}>
		<BrowserChromeRow url={url || tab?.url || ""} loading={state?.loading ?? false} canGoBack={state?.canGoBack ?? false} canGoForward={state?.canGoForward ?? false} hasPage={Boolean(url)} focusNonce={focusNonce}
			onBack={() => act("back")} onForward={() => act("forward")} onReload={() => act(state?.loading ? "stop" : "reload")} onSubmit={submit}
			onOpenInBrowser={() => void api?.workspace.openLink(url).catch(reason => setError(errorText(reason)))}
			onPick={() => void pick()} picking={picking} onCapture={record => void capture(record)} capturing={capturing} recording={recording} onFloat={float} floating={floating}
			downloads={downloads.length} downloadsOpen={downloadsOpen} onDownloads={() => setDownloadsOpen(value => !value)}
			menu={<BrowserMoreMenu enabled={Boolean(url)} zoom={zoom} colorScheme={state?.colorScheme ?? "system"} devToolsOpen={state?.devToolsOpen ?? false} deviceToolbar={viewport.mode === "device"} muted={state?.muted ?? false} downloads={downloads.length} poppedOut={Boolean(state?.poppedOut)}
				zoomShortcuts={{ in: shortcut("browser.zoomIn"), out: shortcut("browser.zoomOut"), reset: shortcut("browser.zoomReset") }}
				actions={{
					hardReload: () => act("hardReload"), toggleDevTools: () => act("devtools"), toggleDeviceToolbar,
					setColorScheme: colorScheme => void send({ id: tabId, type: "colorScheme", colorScheme }),
					zoomIn: () => setZoom(stepBrowserZoom(zoom, 1)), zoomOut: () => setZoom(stepBrowserZoom(zoom, -1)), resetZoom: () => setZoom(1),
					toggleMute: () => void send({ id: tabId, type: "mute", muted: !state?.muted }), openDownloads: () => setDownloadsOpen(true),
					clearCookies: () => void send({ id: tabId, type: "clearData", data: "cookies" }).then(() => flash("Cookies cleared for every browser tab.")),
					clearCache: () => void send({ id: tabId, type: "clearData", data: "cache" }).then(() => flash("Cache cleared for every browser tab.")),
					togglePopOut: () => void send({ id: tabId, type: state?.poppedOut ? "popIn" : "popOut" }),
				}} />} />
		{(error || browserTabError(context)) && <p role="alert" className="flex shrink-0 items-center gap-2 border-y border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">{error || browserTabError(context)}</p>}
		{saved && <BrowserRecordingNotice path={saved.path} revealLabel={revealLabel(api?.platform ?? navigator.platform)} onReveal={() => void api?.browserRecordingReveal(saved.path).catch(reason => setError(errorText(reason)))} onAttach={() => attachRecording(saved)} onDismiss={() => setSaved(undefined)} />}
		{notice && !error && <p role="status" className="shrink-0 px-3 py-1 text-xs text-muted-foreground">{notice}</p>}
		<div className="relative min-h-0 flex-1 overflow-hidden">
			{device && <div className="absolute inset-x-0 top-0 z-10"><BrowserDeviceToolbar key={`${device.width}x${device.height}`} viewport={device} width={slotSize.width + browserResizeRail * 2} aspectLocked={aspectLocked} onAspectLock={setAspectLocked} onChange={setViewport} /></div>}
			{device && <div aria-hidden className="absolute inset-x-0 bottom-0 bg-muted/30" style={{ top: deviceTop }} />}
			<div ref={slot} className="browser-surface absolute" aria-label={state?.title || "Web page"}
				style={device ? { top: deviceTop, left: browserResizeRail, right: browserResizeRail, bottom: browserResizeRail } : { inset: 0 }}>
				{device && frame && <>
					<div aria-hidden className="pointer-events-none absolute bg-background shadow-sm ring-1 ring-border/70" style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }} />
					{rail("east", { left: frame.x + frame.width, top: frame.y, width: browserResizeRail, height: frame.height }, "cursor-ew-resize", "Resize viewport width")}
					{rail("west", { left: frame.x - browserResizeRail, top: frame.y, width: browserResizeRail, height: frame.height }, "cursor-ew-resize")}
					{rail("south", { left: frame.x, top: frame.y + frame.height, width: frame.width, height: browserResizeRail }, "cursor-ns-resize", "Resize viewport height")}
					{rail("southeast", { left: frame.x + frame.width, top: frame.y + frame.height, width: browserResizeRail, height: browserResizeRail }, "cursor-nwse-resize")}
					{rail("southwest", { left: frame.x - browserResizeRail, top: frame.y + frame.height, width: browserResizeRail, height: browserResizeRail }, "cursor-nesw-resize")}
				</>}
			</div>
			{empty && <div className="absolute inset-0 z-20 bg-background"><BrowserEmptyState recents={recents} onOpen={navigate} onRemove={target => setRecents(values => browserRecents(values).filter(item => !((item.project ?? "") === project && item.url === target)))} /></div>}
			{failure && <div className="absolute inset-0 z-20 bg-background"><BrowserUnreachable failure={failure} onReload={() => act("reload")} /></div>}
			{state?.poppedOut && !failure && <div className="absolute inset-0 z-20 bg-background"><BrowserPoppedOut onBringBack={() => void send({ id: tabId, type: "popIn" })} /></div>}
			{downloadsOpen && <div className="absolute inset-0 z-30 bg-background"><BrowserDownloads downloads={downloads} action={command => void downloadAction(command)} onClose={() => setDownloadsOpen(false)} /></div>}
		</div>
	</section>;
}
