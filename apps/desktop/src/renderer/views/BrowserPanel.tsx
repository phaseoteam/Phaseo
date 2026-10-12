import { useDesktopFlags } from "../lib/DesktopFlags";
import { browserRecents, browserNavigationAddress, type BrowserRecent } from "../lib/browserHistory";
import { BrowserAddress } from "../components/BrowserAddress";
import { Select } from "../components/Select";
import { BrowserDownloads } from "./BrowserDownloads";
import type { BrowserDownload, BrowserDownloadCommand } from "../../shared/browserDownloads";
import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, RotateCw, Square, Plus, X, Code2, Download, Globe, Clock } from "lucide-react";
import { browserViewportSizes, type BrowserViewport, type BrowserState } from "../../shared/browser";
import { usePersistedState } from "../lib/persistedState";
import { browserTabs, browserViewportToRestore, updateBrowserTab, openBrowserTab, type BrowserTabs } from "../lib/browserTabs";

export function BrowserPanel({ context, covered, requestedLink }: { context: string; covered: boolean; requestedLink?: { url: string; request: number } }) {
 const [saved, setSaved] = usePersistedState<Record<string, BrowserTabs>>("phaseo.desktop.browserTabs", {});
 const group = browserTabs(saved?.[context], context);
 const lastLink = useRef<number | undefined>(undefined);
 useEffect(() => { if (!requestedLink || requestedLink.request === lastLink.current) return; lastLink.current = requestedLink.request; const id = context + ":" + crypto.randomUUID(); setSaved(values => { const current = browserTabs(values?.[context], context); const existing = current.tabs.find(tab => tab.url === requestedLink.url); if (existing) return { ...values, [context]: { ...current, active: existing.id } }; if (current.tabs.length >= 20) { setTabError("Close a browser tab before opening another."); return values; } return { ...values, [context]: { active: id, tabs: [...current.tabs, { id, title: new URL(requestedLink.url).hostname, url: requestedLink.url, viewport: "desktop" as const }] } }; }); }, [context, requestedLink, setSaved]);
 const [storedRecents, setRecents] = usePersistedState<BrowserRecent[]>("phaseo.desktop.browser.recents", []);
 const recents = browserRecents(storedRecents);
 const lastRecorded = useRef("");
 const [tabError, setTabError] = useState("");
 const [downloads, setDownloads] = useState<BrowserDownload[]>([]);
 const [showDownloads, setShowDownloads] = useState(false);
 useEffect(() => { let active = true; const api = window.phaseoDesktop; const unsubscribe = api?.onBrowserDownloads(values => { if (active) setDownloads(values); }); void api?.browserDownload({ type: "list" }).then(values => { if (active) setDownloads(values); }, reason => { if (active) setTabError(String(reason)); }); return () => { active = false; unsubscribe?.(); }; }, []);
 const chatDownloads = downloads.filter(item => item.sourceId === context || item.sourceId.startsWith(context + ":"));
 async function downloadAction(command: BrowserDownloadCommand) { try { const values = await window.phaseoDesktop?.browserDownload(command); if (values) setDownloads(values); setTabError(""); } catch (reason) { setTabError(String(reason)); } }
 useEffect(() => { document.getElementById("browser-tab-" + group.active)?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [group.active]);
 const update = useCallback((state: BrowserState) => { if (state.url && !state.loading && !state.error && lastRecorded.current !== state.id + ":" + state.url) { lastRecorded.current = state.id + ":" + state.url; setRecents(values => [{ url: state.url, title: state.title || state.url, at: Date.now() }, ...browserRecents(values).filter(item => item.url !== state.url)].slice(0, 100)); } setSaved(values => { const existing = browserTabs(values?.[context], context); const next = updateBrowserTab(existing, state); if (JSON.stringify(existing) === JSON.stringify(next)) return values; return { ...values, [context]: next }; }); }, [context, setSaved, setRecents]);
 useEffect(() => window.phaseoDesktop?.onBrowserOpenTab(request => {
  const id = context + ":" + crypto.randomUUID();
  setSaved(values => { const current = browserTabs(values?.[context], context); try { const next = openBrowserTab(current, request, id); return next === current ? values : { ...values, [context]: next }; } catch (reason) { queueMicrotask(() => setTabError(reason instanceof Error ? reason.message : String(reason))); return values; } });
 }), [context, setSaved]);
 const select = (id: string) => setSaved(values => ({ ...values, [context]: { ...browserTabs(values?.[context], context), active: id } }));
 const add = () => { if (group.tabs.length >= 20) return; const id = context + ":" + crypto.randomUUID(); setSaved(values => { const current = browserTabs(values?.[context], context); return { ...values, [context]: { active: id, tabs: [...current.tabs, { id, title: "New tab", url: "", viewport: "desktop" as const }] } }; }); };
 async function close(id: string) { try { await window.phaseoDesktop?.browser({ type: "close", id }); setSaved(values => { const current = browserTabs(values?.[context], context); const tabs = current.tabs.filter(tab => tab.id !== id); const replacement = context + ":" + crypto.randomUUID(); return { ...values, [context]: tabs.length ? { tabs, active: current.active === id ? tabs[Math.min(current.tabs.findIndex(tab => tab.id === id), tabs.length - 1)].id : current.active } : { active: replacement, tabs: [{ id: replacement, title: "New tab", url: "", viewport: "desktop" as const }] } }; }); setTabError(""); } catch (reason) { setTabError(String(reason)); } }
 const active = group.tabs.find(tab => tab.id === group.active)!;
 return <section className="browser-panel" aria-label="Browser"><div className="browser-tabs" role="tablist" aria-label="Browser tabs">{group.tabs.map(tab => <div className="browser-tab" key={tab.id}><button type="button" role="tab" tabIndex={tab.id === group.active ? 0 : -1} id={"browser-tab-" + tab.id} aria-controls={"browser-page-" + tab.id} onKeyDown={event => { const position = group.tabs.findIndex(value => value.id === tab.id); const next = event.key === "ArrowRight" ? (position + 1) % group.tabs.length : event.key === "ArrowLeft" ? (position + group.tabs.length - 1) % group.tabs.length : event.key === "Home" ? 0 : event.key === "End" ? group.tabs.length - 1 : undefined; if (next !== undefined) { event.preventDefault(); select(group.tabs[next].id); document.getElementById("browser-tab-" + group.tabs[next].id)?.focus(); } }} aria-selected={tab.id === group.active} onClick={() => select(tab.id)} title={tab.title}>{tab.title}</button><button type="button" aria-label={`Close tab: ${tab.title}`} onClick={() => void close(tab.id)}><X size={12} /></button></div>)}<button type="button" aria-label="New browser tab" disabled={group.tabs.length >= 20} onClick={add}><Plus size={15} /></button></div>{tabError && <p className="task-error" role="alert">{tabError}</p>}<BrowserSurface recents={recents} downloadsOpen={showDownloads} downloadCount={chatDownloads.length} onDownloads={() => setShowDownloads(value => !value)} downloadsContent={<BrowserDownloads downloads={chatDownloads} action={command => void downloadAction(command)} />} key={active.id} context={active.id} covered={covered || showDownloads} initialViewport={active.viewport} initialUrl={active.url} onState={update} /></section>;
}

function BrowserSurface({ context, covered, initialUrl, initialViewport, onState, recents, downloadsOpen, downloadCount, onDownloads, downloadsContent }: { recents: BrowserRecent[]; downloadsOpen: boolean; downloadCount: number; onDownloads: () => void; downloadsContent: ReactNode; context: string; covered: boolean; initialUrl: string; initialViewport: BrowserViewport; onState: (state: BrowserState) => void }) {
	const { browserSuggestions } = useDesktopFlags();
	const api = window.phaseoDesktop;
	const slot = useRef<HTMLDivElement>(null);
	const restoreUrl = useRef(initialUrl);
	const restoreViewport = useRef(initialViewport);
	const [state, setState] = useState<BrowserState>();
	const [address, setAddress] = useState("");
	const [error, setError] = useState("");
	useEffect(() => {
		setState(undefined); setAddress(""); setError("");
		if (!api || !slot.current) return;
		let active = true; let restored = false; let viewportRestored = false;
		const apply = (value?: BrowserState) => { if (active && value?.id === context) { if (!viewportRestored) { viewportRestored = true; restoreViewport.current = browserViewportToRestore(value, restoreViewport.current); if (value.viewport !== restoreViewport.current) { void api.browser({ type: "viewport", id: context, viewport: restoreViewport.current }).then(apply, reason => { if (active) setError(String(reason)); }); return; } } if (!value.url && restoreUrl.current && !restored) { restored = true; void api.browser({ type: "navigate", id: context, url: restoreUrl.current }).catch(reason => { if (active) setError(String(reason)); }); return; } if (restored && !value.url) { setState(value); setAddress(restoreUrl.current); setError(value.error ?? ""); return; } setState(value); setAddress(value.url); setError(value.error ?? ""); onState(value); } };
		const unsubscribe = api.onBrowserState(apply);
		let lastBounds = "";
		const resize = () => { if (covered || Array.from(document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"], [role="menu"], [role="listbox"]')).some(element => element.getClientRects().length > 0) || !slot.current) { if (lastBounds !== "hidden") void api.browser({ type: "hide", id: context }); lastBounds = "hidden"; return; } const rect = slot.current.getBoundingClientRect(); const signature = JSON.stringify([rect.x, rect.y, rect.width, rect.height]); if (signature === lastBounds) return; lastBounds = signature; void api.browser({ type: "show", id: context, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }).then(apply, reason => { if (active) setError(String(reason)); }); };
		let overlayFrame = 0;
		const modals = new MutationObserver(() => { resize(); cancelAnimationFrame(overlayFrame); overlayFrame = requestAnimationFrame(resize); }); modals.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style", "data-open", "data-closed"] });
		const observer = new ResizeObserver(resize); observer.observe(slot.current); window.addEventListener("resize", resize); resize();
		return () => { active = false; observer.disconnect(); modals.disconnect(); cancelAnimationFrame(overlayFrame); unsubscribe(); window.removeEventListener("resize", resize); void api.browser({ type: "hide", id: context }); };
	}, [api, context, covered, onState]);
	async function action(type: "back" | "forward" | "reload" | "stop" | "devtools") { try { await api?.browser({ type, id: context }); } catch (reason) { setError(String(reason)); } }
	async function preview(viewport: BrowserViewport) { try { const result = await api?.browser({ type: "viewport", id: context, viewport }); if (result) { restoreViewport.current = result.viewport; setState(result); onState(result); } } catch (reason) { setError(String(reason)); } }
	async function navigateTo(url: string) { try { setError(""); await api?.browser({ type: "navigate", id: context, url }); } catch (reason) { setError(String(reason)); } }
	async function navigate() { try { setError(""); const url = browserNavigationAddress(address); await api?.browser({ type: "navigate", id: context, url }); } catch (reason) { setError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); } }
	return <div className="browser-panel browser-tab-surface" role="tabpanel" id={"browser-page-" + context} aria-labelledby={"browser-tab-" + context}>
		<form className="browser-toolbar" onSubmit={event => { event.preventDefault(); void navigate(); }}>
			<button type="button" aria-label="Browser back" disabled={!state?.canGoBack} onClick={() => void action("back")}><ArrowLeft size={15} /></button>
			<button type="button" aria-label="Browser forward" disabled={!state?.canGoForward} onClick={() => void action("forward")}><ArrowRight size={15} /></button>
			<button type="button" aria-label={state?.loading ? "Stop loading" : "Reload page"} onClick={() => void action(state?.loading ? "stop" : "reload")}>{state?.loading ? <Square size={15} /> : <RotateCw size={15} />}</button>
			<BrowserAddress value={address} onChange={setAddress} recents={recents} suggestions={browserSuggestions} navigate={url => { void api?.browser({ type: "navigate", id: context, url }).catch(reason => setError(String(reason))); }} /><button type="button" aria-label="Downloads" aria-pressed={downloadsOpen} onClick={onDownloads}><Download size={15} />{downloadCount > 0 && <span>{downloadCount}</span>}</button><button type="button" aria-label="Developer tools" aria-pressed={state?.devToolsOpen ?? false} disabled={!state?.url} onClick={() => void action("devtools")}><Code2 size={15} /></button>
		</form>
		{downloadsOpen ? downloadsContent : <><div className="browser-preview-toolbar"><Select label="Browser viewport" value={state?.viewport?.startsWith("phone") ? "phone" : state?.viewport?.startsWith("tablet") ? "tablet" : "desktop"} onValueChange={value => void preview(value as BrowserViewport)} options={[{ value: "desktop", label: "Desktop" }, { value: "phone", label: "Phone" }, { value: "tablet", label: "Tablet" }]} />{state?.viewport && state.viewport !== "desktop" && <><span>{browserViewportSizes[state.viewport].width} × {browserViewportSizes[state.viewport].height}</span><button type="button" aria-label="Rotate viewport" onClick={() => void preview(state.viewport === "phone" ? "phone-landscape" : state.viewport === "phone-landscape" ? "phone" : state.viewport === "tablet" ? "tablet-landscape" : "tablet")}><RotateCw size={14} /></button></>}</div>
		{error && <p className="task-error" role="alert">{error}</p>}
		<div className="browser-surface" ref={slot} aria-label={state?.title || "Web page"}>{!state?.url && <div className="browser-empty"><h2>New tab</h2>{browserSuggestions && <><div className="browser-suggestions"><button type="button" onClick={() => void navigateTo("https://phaseo.app")}><Globe size={18} />Phaseo</button><button type="button" onClick={() => void navigateTo("https://docs.phaseo.app")}><Globe size={18} />Documentation</button></div>{recents.length > 0 && <section className="browser-recents" aria-label="Recent browser pages"><h3>Recent</h3>{recents.slice(0, 8).map(item => <button type="button" key={item.url} title={item.url} onClick={() => void navigateTo(item.url)}><Clock size={15} /><span>{item.title}</span></button>)}</section>}</>}</div>}</div></>}
	</div>;
}
