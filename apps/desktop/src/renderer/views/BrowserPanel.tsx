import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, ArrowRight, RotateCw, Square, Plus, X } from "lucide-react";
import type { BrowserState } from "../../shared/browser";
import { usePersistedState } from "../lib/persistedState";
import { browserTabs, updateBrowserTab, type BrowserTabs } from "../lib/browserTabs";

export function BrowserPanel({ context, covered }: { context: string; covered: boolean }) {
 const [saved, setSaved] = usePersistedState<Record<string, BrowserTabs>>("phaseo.desktop.browserTabs", {});
 const group = browserTabs(saved?.[context], context);
 const [tabError, setTabError] = useState("");
 const update = useCallback((state: BrowserState) => setSaved(values => { const existing = browserTabs(values?.[context], context); const next = updateBrowserTab(existing, state); if (JSON.stringify(existing) === JSON.stringify(next)) return values; return { ...values, [context]: next }; }), [context, setSaved]);
 const select = (id: string) => setSaved(values => ({ ...values, [context]: { ...browserTabs(values?.[context], context), active: id } }));
 const add = () => { if (group.tabs.length >= 20) return; const id = context + ":" + crypto.randomUUID(); setSaved(values => { const current = browserTabs(values?.[context], context); return { ...values, [context]: { active: id, tabs: [...current.tabs, { id, title: "New tab", url: "" }] } }; }); };
 async function close(id: string) { try { await window.phaseoDesktop?.browser({ type: "close", id }); setSaved(values => { const current = browserTabs(values?.[context], context); const tabs = current.tabs.filter(tab => tab.id !== id); const replacement = context + ":" + crypto.randomUUID(); return { ...values, [context]: tabs.length ? { tabs, active: current.active === id ? tabs[Math.min(current.tabs.findIndex(tab => tab.id === id), tabs.length - 1)].id : current.active } : { active: replacement, tabs: [{ id: replacement, title: "New tab", url: "" }] } }; }); setTabError(""); } catch (reason) { setTabError(String(reason)); } }
 const active = group.tabs.find(tab => tab.id === group.active)!;
 return <section className="browser-panel" aria-label="Browser"><div className="browser-tabs" role="tablist" aria-label="Browser tabs">{group.tabs.map(tab => <div className="browser-tab" key={tab.id}><button type="button" role="tab" tabIndex={tab.id === group.active ? 0 : -1} id={"browser-tab-" + tab.id} aria-controls={"browser-page-" + tab.id} onKeyDown={event => { const position = group.tabs.findIndex(value => value.id === tab.id); const next = event.key === "ArrowRight" ? (position + 1) % group.tabs.length : event.key === "ArrowLeft" ? (position + group.tabs.length - 1) % group.tabs.length : event.key === "Home" ? 0 : event.key === "End" ? group.tabs.length - 1 : undefined; if (next !== undefined) { event.preventDefault(); select(group.tabs[next].id); document.getElementById("browser-tab-" + group.tabs[next].id)?.focus(); } }} aria-selected={tab.id === group.active} onClick={() => select(tab.id)} title={tab.title}>{tab.title}</button><button type="button" aria-label={`Close tab: ${tab.title}`} onClick={() => void close(tab.id)}><X size={12} /></button></div>)}<button type="button" aria-label="New browser tab" disabled={group.tabs.length >= 20} onClick={add}><Plus size={15} /></button></div>{tabError && <p className="task-error" role="alert">{tabError}</p>}<BrowserSurface key={active.id} context={active.id} covered={covered} initialUrl={active.url} onState={update} /></section>;
}

function BrowserSurface({ context, covered, initialUrl, onState }: { context: string; covered: boolean; initialUrl: string; onState: (state: BrowserState) => void }) {
	const api = window.phaseoDesktop;
	const slot = useRef<HTMLDivElement>(null);
	const restoreUrl = useRef(initialUrl);
	const [state, setState] = useState<BrowserState>();
	const [address, setAddress] = useState("");
	const [error, setError] = useState("");
	useEffect(() => {
		setState(undefined); setAddress(""); setError("");
		if (!api || !slot.current) return;
		let active = true; let restored = false;
		const apply = (value?: BrowserState) => { if (active && value?.id === context) { if (!value.url && restoreUrl.current && !restored) { restored = true; void api.browser({ type: "navigate", id: context, url: restoreUrl.current }).catch(reason => { if (active) setError(String(reason)); }); return; } if (restored && !value.url) { setState(value); setAddress(restoreUrl.current); setError(value.error ?? ""); return; } setState(value); setAddress(value.url); setError(value.error ?? ""); onState(value); } };
		const unsubscribe = api.onBrowserState(apply);
		let lastBounds = "";
		const resize = () => { if (covered || document.querySelector('dialog[open], [role="dialog"], [aria-modal="true"], [role="menu"]') || !slot.current) { if (lastBounds !== "hidden") void api.browser({ type: "hide", id: context }); lastBounds = "hidden"; return; } const rect = slot.current.getBoundingClientRect(); const signature = JSON.stringify([rect.x, rect.y, rect.width, rect.height]); if (signature === lastBounds) return; lastBounds = signature; void api.browser({ type: "show", id: context, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }).then(apply, reason => { if (active) setError(String(reason)); }); };
		const modals = new MutationObserver(resize); modals.observe(document.body, { childList: true, subtree: true });
		const observer = new ResizeObserver(resize); observer.observe(slot.current); window.addEventListener("resize", resize); resize();
		return () => { active = false; observer.disconnect(); modals.disconnect(); unsubscribe(); window.removeEventListener("resize", resize); void api.browser({ type: "hide", id: context }); };
	}, [api, context, covered, onState]);
	async function action(type: "back" | "forward" | "reload" | "stop") { try { await api?.browser({ type, id: context }); } catch (reason) { setError(String(reason)); } }
	async function navigate() { try { setError(""); const url = /^[a-z][a-z\d+.-]*:/i.test(address) ? address : `https://${address}`; await api?.browser({ type: "navigate", id: context, url }); } catch (reason) { setError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); } }
	return <div className="browser-panel browser-tab-surface" role="tabpanel" id={"browser-page-" + context} aria-labelledby={"browser-tab-" + context}>
		<form className="browser-toolbar" onSubmit={event => { event.preventDefault(); void navigate(); }}>
			<button type="button" aria-label="Browser back" disabled={!state?.canGoBack} onClick={() => void action("back")}><ArrowLeft size={15} /></button>
			<button type="button" aria-label="Browser forward" disabled={!state?.canGoForward} onClick={() => void action("forward")}><ArrowRight size={15} /></button>
			<button type="button" aria-label={state?.loading ? "Stop loading" : "Reload page"} onClick={() => void action(state?.loading ? "stop" : "reload")}>{state?.loading ? <Square size={15} /> : <RotateCw size={15} />}</button>
			<input aria-label="Browser address" placeholder="Enter a URL" value={address} onChange={event => setAddress(event.target.value)} /><button type="submit" disabled={!address.trim()}>Go</button>
		</form>
		{error && <p className="task-error" role="alert">{error}</p>}
		<div className="browser-surface" ref={slot} aria-label={state?.title || "Web page"}>{!state?.url && <div className="browser-empty"><h2>Browse alongside your chat</h2><p>Enter a website or local development address.</p></div>}</div>
	</div>;
}
