import katex from "katex";
import "katex/dist/katex.min.css";
import type { ReactNode } from "react";

// Pages of history remount their messages; typeset markup is kept so formulas are not typeset again. "" is a parse error.
const cache = new Map<string, string>();

function typeset(tex: string, display: boolean) {
	const key = `${display ? "display" : "inline"}:${tex}`;
	const cached = cache.get(key);
	if (cached !== undefined) return cached;
	let html = "";
	try {
		// trust: false keeps \href, \url and \htmlClass from emitting links or attributes.
		html = katex.renderToString(tex, { displayMode: display, output: "htmlAndMathml", throwOnError: true, trust: false, strict: "ignore", maxSize: 20, maxExpand: 1000 });
	} catch { /* Unfinished or unsupported TeX stays readable as its source. */ }
	if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
	cache.set(key, html);
	return html;
}

/** KaTeX and its fonts live in this lazily loaded chunk, fetched only once a formula renders. */
export default function MathTypeset({ tex, display, fallback }: { tex: string; display: boolean; fallback: ReactNode }) {
	const html = typeset(tex, display);
	// KaTeX escapes the TeX it renders.
	return html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : fallback;
}
