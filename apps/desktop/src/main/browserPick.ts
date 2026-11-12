/**
 * Runs in an isolated world of the page: outlines the element under the pointer and resolves with the one clicked,
 * or null on Escape or cancel. The page's own scripts cannot see or call it.
 */
export const pickScript = `new Promise(resolve => {
	window.__phaseoPick?.cancel();
	const box = document.createElement("div");
	const label = document.createElement("div");
	box.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;display:none;border:2px solid #3b82f6;background:rgba(59,130,246,.12);border-radius:3px;box-sizing:border-box;transition:all 60ms ease-out";
	label.style.cssText = "position:absolute;left:-2px;top:-22px;padding:1px 6px;border-radius:4px;background:#3b82f6;color:#fff;font:500 11px/18px system-ui,sans-serif;white-space:nowrap";
	box.append(label);
	let current = null;
	const selectorOf = element => {
		const parts = [];
		for (let node = element; node && node.nodeType === 1 && parts.length < 6; node = node.parentElement) {
			if (node.id && /^[A-Za-z][\\w-]*$/.test(node.id)) { parts.unshift("#" + node.id); break; }
			let part = node.tagName.toLowerCase();
			const parent = node.parentElement;
			if (parent) { const same = Array.from(parent.children).filter(child => child.tagName === node.tagName); if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(node) + 1) + ")"; }
			parts.unshift(part);
		}
		return parts.join(" > ");
	};
	const move = event => {
		const element = document.elementFromPoint(event.clientX, event.clientY);
		if (!element || element === box || box.contains(element)) return;
		current = element;
		const rect = element.getBoundingClientRect();
		Object.assign(box.style, { display: "block", left: rect.left + "px", top: rect.top + "px", width: rect.width + "px", height: rect.height + "px" });
		label.textContent = element.tagName.toLowerCase();
		label.style.top = rect.top < 24 ? "100%" : "-22px";
	};
	const block = event => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); };
	const finish = value => {
		removeEventListener("mousemove", move, true); removeEventListener("click", click, true); removeEventListener("mousedown", block, true); removeEventListener("mouseup", block, true); removeEventListener("keydown", key, true);
		box.remove(); delete window.__phaseoPick; resolve(value);
	};
	const click = event => {
		block(event);
		if (!current) return;
		const rect = current.getBoundingClientRect();
		box.remove();
		requestAnimationFrame(() => requestAnimationFrame(() => finish({ selector: selectorOf(current), text: (current.innerText || current.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 500), tag: current.tagName.toLowerCase(), rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } })));
	};
	const key = event => { if (event.key === "Escape") { block(event); finish(null); } };
	addEventListener("mousemove", move, true); addEventListener("click", click, true); addEventListener("mousedown", block, true); addEventListener("mouseup", block, true); addEventListener("keydown", key, true);
	window.__phaseoPick = { cancel: () => finish(null) };
	document.documentElement.append(box);
})`;
