import { agentCursorActiveMs } from "../shared/browser";

/**
 * Drawn inside the page, from an isolated world, because the native page always draws above the app's own DOM: the agent's cursor
 * (T3 Code's MousePointer2 with a click ripple) and the zoom pill at the top right. Everything sits in a closed shadow root that
 * ignores the pointer, and is scaled against the page zoom so it keeps its size.
 */
const install = `(() => {
	if (window.__phaseoOverlay) return window.__phaseoOverlay;
	let host, cursor, ripple, pill, pillTimer, fadeTimer, factor = 1, controller = "none", active = false, shown = false, last = null;
	const pointer = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#fff" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/></svg>';
	const mount = () => {
		if (host && host.isConnected) return;
		host = document.createElement("phaseo-overlay");
		host.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;contain:strict";
		const root = host.attachShadow({ mode: "closed" });
		root.innerHTML = '<style>'
			+ ':host{all:initial}'
			+ '.cursor{position:absolute;left:0;top:0;opacity:0;transition:opacity 150ms ease-out,transform 150ms ease-out;will-change:transform}'
			+ '.cursor svg{position:relative;display:block;transform:translate(-2px,-2px);filter:drop-shadow(0 1px 1px rgba(0,0,0,.25))}'
			+ '.ripple{position:absolute;left:2px;top:2px;width:16px;height:16px;border-radius:9999px;background:rgba(37,99,235,.25);opacity:0}'
			+ '.ripple.on{animation:ping 1s cubic-bezier(0,0,.2,1) 1}'
			+ '@keyframes ping{0%{transform:scale(1);opacity:1}75%,100%{transform:scale(2);opacity:0}}'
			+ '.pill{position:absolute;top:12px;right:12px;padding:4px 10px;border-radius:9999px;border:1px solid rgba(127,127,127,.35);background:rgba(28,28,30,.92);color:#fafafa;font:500 12px/16px system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;box-shadow:0 4px 6px -1px rgba(0,0,0,.1);opacity:0;transform:translateY(-4px);transition:opacity 200ms ease-out,transform 200ms ease-out;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}'
			+ '.pill.on{opacity:1;transform:none}'
			+ '@media (prefers-reduced-motion:reduce){.cursor,.pill{transition:none}.ripple.on{animation:none}}'
			+ '</style><div class="cursor"><span class="ripple"></span>' + pointer + '</div><div class="pill" aria-hidden="true"></div>';
		cursor = root.querySelector(".cursor"); ripple = root.querySelector(".ripple"); pill = root.querySelector(".pill");
		(document.body || document.documentElement).append(host);
	};
	const scale = value => { factor = value > 0 ? value : 1; if (host) host.style.zoom = String(1 / factor); if (last) place(last.x, last.y); };
	const place = (x, y) => { last = { x, y }; cursor.style.transform = "translate3d(" + (x * factor) + "px," + (y * factor) + "px,0)"; };
	const opacity = () => { if (!shown) return "0"; return String(active ? 1 : controller === "human" ? 0.18 : 0.35); };
	const paint = () => { if (cursor) cursor.style.opacity = opacity(); };
	return window.__phaseoOverlay = {
		cursor(x, y, phase, zoom) {
			mount(); scale(zoom); shown = true; active = true; place(x, y); paint();
			if (phase === "click") { ripple.classList.remove("on"); void ripple.offsetWidth; ripple.classList.add("on"); }
			clearTimeout(fadeTimer); fadeTimer = setTimeout(() => { active = false; paint(); }, ${agentCursorActiveMs});
		},
		controller(value) { controller = value; paint(); },
		zoom(value) {
			mount(); scale(value); pill.textContent = Math.round(value * 100) + "%"; pill.classList.add("on");
			clearTimeout(pillTimer); pillTimer = setTimeout(() => pill.classList.remove("on"), 1500);
		},
	};
})()`;

/** Script that draws the agent cursor at a point in page CSS pixels; phase "click" adds the ripple. */
export const overlayCursorScript = (x: number, y: number, phase: "move" | "click", zoom: number) => `${install}.cursor(${Number(x) || 0}, ${Number(y) || 0}, ${JSON.stringify(phase)}, ${Number(zoom) || 1})`;
/** Script that shows the zoom pill for a moment. */
export const overlayZoomScript = (zoom: number) => `${install}.zoom(${Number(zoom) || 1})`;
/** Script that tells a drawn cursor who drives the page; it draws nothing on a page without one. */
export const overlayControllerScript = (controller: string) => `window.__phaseoOverlay?.controller(${JSON.stringify(controller)})`;
