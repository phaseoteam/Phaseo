import { useEffect, useState, type RefObject } from "react";
import { OPEN_PROJECT_FILE_EVENT, pendingFileLines as pending, pendingLineKey as key, type OpenProjectFileDetail } from "./events";

/** The rendered line elements inside the file view's shadow roots. */
function lineElements(container: HTMLElement) {
	const roots: ParentNode[] = [container];
	for (const element of container.querySelectorAll<HTMLElement>("*")) if (element.shadowRoot) roots.push(element.shadowRoot);
	return roots.flatMap(root => [...root.querySelectorAll<HTMLElement>("[data-line]")]);
}

/**
 * The line a terminal link (or another caller) asked the Files pane to show, highlighted and scrolled to. The view
 * renders lines as they come into view, so it jumps near the line by measured height until the line is drawn.
 */
export function useRevealLine(projectId: string, path: string, container: RefObject<HTMLElement | null>, ready: boolean) {
	const [target, setTarget] = useState<{ line: number; at: number }>();
	useEffect(() => {
		const stored = pending.get(key(projectId, path)); pending.delete(key(projectId, path));
		setTarget(stored ? { line: stored, at: Date.now() } : undefined);
		const open = (event: Event) => { const detail = (event as CustomEvent<OpenProjectFileDetail>).detail; if (detail?.projectId === projectId && detail.path === path && detail.line) { pending.delete(key(projectId, path)); setTarget({ line: detail.line, at: Date.now() }); } };
		window.addEventListener(OPEN_PROJECT_FILE_EVENT, open);
		return () => window.removeEventListener(OPEN_PROJECT_FILE_EVENT, open);
	}, [projectId, path]);
	useEffect(() => {
		if (!target || !ready) return;
		let frame = 0, tries = 0;
		const step = () => {
			const host = container.current;
			if (!host || ++tries > 90) return;
			const lines = lineElements(host), exact = lines.find(element => element.dataset.line === String(target.line));
			if (exact) { exact.scrollIntoView({ block: "center" }); return; }
			const sample = lines.find(element => Number(element.dataset.line) > 0), scroller = host.querySelector<HTMLElement>(".overflow-auto") ?? host;
			if (sample) scroller.scrollTop += (target.line - Number(sample.dataset.line)) * Math.max(12, sample.getBoundingClientRect().height);
			frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	}, [target, ready, container]);
	return target?.line;
}
