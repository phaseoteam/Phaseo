import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCw, Square } from "lucide-react";
import type { BrowserState } from "../../shared/browser";

export function BrowserPanel({ context, covered }: { context: string; covered: boolean }) {
	const api = window.phaseoDesktop;
	const slot = useRef<HTMLDivElement>(null);
	const [state, setState] = useState<BrowserState>();
	const [address, setAddress] = useState("");
	const [error, setError] = useState("");
	useEffect(() => {
		setState(undefined); setAddress(""); setError("");
		if (!api || !slot.current) return;
		let active = true;
		const apply = (value?: BrowserState) => { if (active && value?.id === context) { setState(value); setAddress(value.url); setError(value.error ?? ""); } };
		const unsubscribe = api.onBrowserState(apply);
		let lastBounds = "";
		const resize = () => { if (covered || document.querySelector('dialog[open], [role="dialog"], [aria-modal="true"], [role="menu"]') || !slot.current) { if (lastBounds !== "hidden") void api.browser({ type: "hide", id: context }); lastBounds = "hidden"; return; } const rect = slot.current.getBoundingClientRect(); const signature = JSON.stringify([rect.x, rect.y, rect.width, rect.height]); if (signature === lastBounds) return; lastBounds = signature; void api.browser({ type: "show", id: context, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }).then(apply, reason => { if (active) setError(String(reason)); }); };
		const modals = new MutationObserver(resize); modals.observe(document.body, { childList: true, subtree: true });
		const observer = new ResizeObserver(resize); observer.observe(slot.current); window.addEventListener("resize", resize); resize();
		return () => { active = false; observer.disconnect(); modals.disconnect(); unsubscribe(); window.removeEventListener("resize", resize); void api.browser({ type: "hide", id: context }); };
	}, [api, context, covered]);
	async function action(type: "back" | "forward" | "reload" | "stop") { try { await api?.browser({ type, id: context }); } catch (reason) { setError(String(reason)); } }
	async function navigate() { try { setError(""); const url = /^[a-z][a-z\d+.-]*:/i.test(address) ? address : `https://${address}`; await api?.browser({ type: "navigate", id: context, url }); } catch (reason) { setError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); } }
	return <section className="browser-panel" aria-label="Browser">
		<form className="browser-toolbar" onSubmit={event => { event.preventDefault(); void navigate(); }}>
			<button type="button" aria-label="Browser back" disabled={!state?.canGoBack} onClick={() => void action("back")}><ArrowLeft size={15} /></button>
			<button type="button" aria-label="Browser forward" disabled={!state?.canGoForward} onClick={() => void action("forward")}><ArrowRight size={15} /></button>
			<button type="button" aria-label={state?.loading ? "Stop loading" : "Reload page"} onClick={() => void action(state?.loading ? "stop" : "reload")}>{state?.loading ? <Square size={15} /> : <RotateCw size={15} />}</button>
			<input aria-label="Browser address" placeholder="Enter a URL" value={address} onChange={event => setAddress(event.target.value)} /><button type="submit" disabled={!address.trim()}>Go</button>
		</form>
		{error && <p className="task-error" role="alert">{error}</p>}
		<div className="browser-surface" ref={slot} aria-label={state?.title || "Web page"}>{!state?.url && <div className="browser-empty"><h2>Browse alongside your chat</h2><p>Enter a website or local development address.</p></div>}</div>
	</section>;
}
