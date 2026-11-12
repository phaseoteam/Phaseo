import DOMPurify from "dompurify";
import mermaid from "mermaid";
import { useEffect, useState } from "react";

let purifier: ReturnType<typeof DOMPurify> | undefined;
/**
 * Diagrams come from model output and pull request text. Mermaid's strict mode escapes labels and drops click
 * handlers; this is defence in depth against anything that could navigate, run script or fetch: no links, images,
 * HTML islands or remote references in its stylesheet.
 */
export function sanitizeDiagram(svg: string) {
	if (!purifier) {
		purifier = DOMPurify(window);
		purifier.addHook("uponSanitizeElement", node => { if (node.nodeName.toLowerCase() === "style" && node.textContent && /url\(|@import/i.test(node.textContent)) node.textContent = node.textContent.replace(/@import[^;]*;?|url\([^)]*\)/gi, "none"); });
	}
	return purifier.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ["a", "image", "foreignObject", "script"], FORBID_ATTR: ["href", "xlink:href", "src", "srcset"] });
}

let queue: Promise<unknown> = Promise.resolve(), counter = 0;
/** Mermaid keeps one global configuration, so renders take turns. */
function render(source: string, dark: boolean) {
	const next = queue.then(async () => {
		mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true, securityLevel: "strict", theme: dark ? "dark" : "default", htmlLabels: false, flowchart: { htmlLabels: false }, fontFamily: "inherit" });
		const { svg } = await mermaid.render(`phaseo-mermaid-${++counter}`, source);
		return sanitizeDiagram(svg);
	});
	queue = next.catch(() => undefined);
	return next;
}

/**
 * Mermaid lives in this lazily loaded chunk, so a chat without diagrams never fetches it. Until a diagram renders, and
 * when it cannot (mid-stream or invalid), `onFailure` lets the code block show its source instead.
 */
export default function MermaidDiagram({ source, dark, onRendered, onFailure }: { source: string; dark: boolean; onRendered: (svg: string) => void; onFailure: (message: string) => void }) {
	const [svg, setSvg] = useState("");
	useEffect(() => {
		let active = true;
		// Streaming replies change the source on every chunk; only a pause is worth a render.
		const timer = setTimeout(() => void render(source, dark).then(value => { if (active) { setSvg(value); onRendered(value); } }, (reason: unknown) => { if (active) onFailure(reason instanceof Error ? reason.message : "The diagram could not be rendered."); }), 250);
		return () => { active = false; clearTimeout(timer); };
	// The callbacks only report back; they do not change the diagram.
	}, [source, dark]);
	return svg ? <div className="message-diagram" dangerouslySetInnerHTML={{ __html: svg }} /> : null;
}
