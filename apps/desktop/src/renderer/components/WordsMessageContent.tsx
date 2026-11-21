import { Markdown, type Components, type PluginConfig } from "@pierre/words/react";
import { escapeHtml } from "@pierre/words/html";
import { createHighlightsPlugin } from "@pierre/words/highlights";
import { createMermaidPlugin } from "@pierre/words/mermaid";
import githubLight from "@pierre/highlights/themes/github-light";
import githubDark from "@pierre/highlights/themes/github-dark";
import { render as renderMermaid } from "pele";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Code2, Copy, Expand, Table2, Workflow, WrapText } from "lucide-react";
import { CHIP_LINK_SCHEME, chipFromLinkUrl, chipMarkdown } from "@phaseo/app-kit/message-chips-markdown";
import type { Chip } from "@phaseo/app-kit/message-chips";
import { createMarkdownPrefixCache } from "@phaseo/app-kit/markdown-prefix-cache";
import { splitDetails, type MarkdownPart } from "@phaseo/app-kit/markdown-details";
import { ChipVariantContext, MessageChip } from "./MessageChips";
import { MessageImage, MessageLink, ProjectContext, messageAlerts } from "./MessageContent";
import { ImageViewer } from "./ImageViewer";
import { parseFileReference } from "../../shared/editors";
import { repairFileLinks } from "./repairFileLinks";
import { tableCsv, tableMarkdown, tableRows } from "./markdownTable";
import { showToast } from "./ui/toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import type { AlertKind } from "./remarkRichBlocks";
// wordsMessage.css imports Words' own styles.css into a low layer, under the app's message styles.
import "./wordsMessage.css";

const CHIP_PATH = "/__phaseo-chip/";
const LOCAL_PATH = "/__phaseo-local/";

/** Chip links and local file links survive Words' URL filter as relative paths; the hooks below swap them for portals. */
function urlTransform(url: string, key: "href" | "src") {
	if (url.startsWith(CHIP_LINK_SCHEME)) return CHIP_PATH + encodeURIComponent(url);
	// File references (C:\…, file://, /Users/…) and project image paths would fail the scheme check.
	if (key === "src" ? !/^(https:|data:image\/)/i.test(url) : !!parseFileReference(url) && !/^https?:/i.test(url)) return LOCAL_PATH + encodeURIComponent(url);
	return url;
}
const local = (value: string) => value.startsWith(LOCAL_PATH) ? decodeURIComponent(value.slice(LOCAL_PATH.length)) : value;
const attribute = (html: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(html)?.[1]?.replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
// One pass: tags drop and entities decode together, so decoded text is never read again as markup.
const TEXT_ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&amp;": "&" };
const textOf = (html: string) => html.replace(/<[^>]*>|&(?:lt|gt|quot|amp);/g, match => TEXT_ENTITIES[match] ?? "");
const data = (fields: Record<string, string>) => Object.entries(fields).map(([name, value]) => ` data-${name}="${escapeHtml(value)}"`).join("");

const components: Components = {
	a: html => {
		const href = attribute(html, "href");
		if (!href || href.startsWith("#")) return html;
		const label = textOf(html.replace(/^<a\b[^>]*>/, "").replace(/<\/a>$/, ""));
		if (href.startsWith(CHIP_PATH)) {
			let chip: Chip | undefined;
			try { chip = chipFromLinkUrl(decodeURIComponent(href.slice(CHIP_PATH.length))); } catch { /* Malformed: text. */ }
			return chip ? `<span${data({ portal: "chip", chip: JSON.stringify(chip) })}></span>` : `<span>${escapeHtml(label)}</span>`;
		}
		return `<span${data({ portal: "link", href: local(href), label })}></span>`;
	},
	img: html => `<span${data({ portal: "image", src: local(attribute(html, "src") ?? ""), alt: attribute(html, "alt") ?? "" })}></span>`,
	table: html => `<div class="message-table"><div class="message-table-scroll">${html}</div><span${data({ portal: "table-copy" })}></span></div>`,
	// GitHub's alerts: Words leaves `[!NOTE]` as text in the blockquote's first paragraph.
	blockquote: html => {
		const match = /^<blockquote\b[^>]*>\s*<p\b[^>]*>\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|<br\b[^>]*>\n?)?/i.exec(html);
		if (!match) return html;
		const kind = match[1].toLowerCase() as AlertKind;
		const rest = html.slice(match[0].length).replace(/<\/blockquote>\s*$/, "");
		const body = rest.startsWith("</p>") ? rest.slice(4) : `<p>${rest}`;
		return `<div role="note" class="message-alert" data-alert="${kind}"><p class="message-alert-title" data-find-ignore><span${data({ portal: "alert-icon", kind })}></span>${messageAlerts[kind].label}</p>${body}</div>`;
	},
};

const plugins: PluginConfig = {
	code: createHighlightsPlugin({ themes: { light: githubLight, dark: githubDark } }),
	// Pele draws with CSS variables (the app's tokens, in wordsMessage.css), so diagrams follow the theme without drawing
	// again. One wider than the message column turns from left-to-right to top-to-bottom instead of shrinking its text.
	mermaid: createMermaidPlugin({ render: renderMermaid }, { maxWidth: 700, directionBreakpoint: 100_000, fontSize: 13 }),
};

/** Copies on click and shows Copied (or Copy failed) for two seconds. */
function useCopy() {
	const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
	useEffect(() => { if (status === "idle") return; const timer = setTimeout(() => setStatus("idle"), 2000); return () => clearTimeout(timer); }, [status]);
	return { status, copy: (text: string) => void navigator.clipboard.writeText(text).then(() => setStatus("copied"), () => setStatus("failed")) };
}

const blockCode = (block: HTMLElement) => block.dataset.code ?? block.querySelector('[data-markdown="code-lines"]')?.textContent?.replace(/\n$/, "") ?? block.querySelector("code")?.textContent ?? "";

function CodeAction({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: ReactNode }) {
	return <button type="button" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick} className="message-code-icon">{children}</button>;
}

/**
 * CodeBlock's header actions, mounted into a Words code block's header: Wrap and Copy code, and for a diagram Expand
 * and Show code. The states live on the host element (`data-wrap`, `data-show-code`), which wordsMessage.css reads.
 */
function CodeActions({ block, host }: { block: HTMLElement; host: HTMLElement }) {
	const diagram = block.dataset.language === "mermaid" && !!block.querySelector('[data-markdown="mermaid"] svg');
	const [wrap, setWrap] = useState(false);
	const [showCode, setShowCode] = useState(false);
	const [viewer, setViewer] = useState<string>();
	const { status, copy } = useCopy();
	useLayoutEffect(() => { host.toggleAttribute("data-wrap", wrap); host.toggleAttribute("data-show-code", diagram && showCode); }, [host, wrap, showCode, diagram]);
	// The diagram's source, shown in place of the drawing; Words keeps it in `data-code`.
	const source = diagram && showCode ? <pre className="words-diagram-source"><code>{blockCode(block)}</code></pre> : null;
	const sourceHost = useMemo(() => document.createElement("div"), []);
	useLayoutEffect(() => {
		if (!source) { sourceHost.remove(); return; }
		if (sourceHost.parentNode !== block) block.append(sourceHost);
	});
	return <>
		{status !== "idle" && <span className="words-code-status" aria-live="polite">{status === "failed" ? "Copy failed" : ""}</span>}
		{diagram && !showCode && <CodeAction label="Expand diagram" onClick={() => {
			const svg = block.querySelector('[data-markdown="mermaid"] svg');
			if (svg) setViewer(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(withResolvedColours(svg))}`);
		}}><Expand size={14} /></CodeAction>}
		{diagram && <CodeAction label={showCode ? "Show diagram" : "Show code"} onClick={() => setShowCode(value => !value)}>{showCode ? <Workflow size={14} /> : <Code2 size={14} />}</CodeAction>}
		{!diagram && <CodeAction label={wrap ? "Scroll long lines" : "Wrap long lines"} pressed={wrap} onClick={() => setWrap(value => !value)}><WrapText size={14} /></CodeAction>}
		<button type="button" onClick={() => copy(blockCode(block))} aria-label={status === "copied" ? "Copied" : "Copy code"}>{status === "copied" ? <Check size={14} /> : <Copy size={14} />}{status === "copied" ? "Copied" : "Copy code"}</button>
		{source && createPortal(source, sourceHost)}
		{viewer && <ImageViewer images={[{ src: viewer, alt: "Diagram" }]} index={0} onClose={() => setViewer(undefined)} />}
	</>;
}

/** A diagram as a standalone SVG for the image viewer: its CSS variables (the theme) written in as colours. */
function withResolvedColours(svg: Element) {
	const copy = svg.cloneNode(true) as SVGElement;
	const style = getComputedStyle(svg);
	const names = ["--pele-bg", "--pele-fg", "--pele-muted", "--pele-line", "--pele-surface", "--pele-surface-alt", "--pele-border", "--pele-accent"];
	const values = names.map(name => `${name}:${style.getPropertyValue(name).trim()}`).filter(value => !value.endsWith(":")).join(";");
	copy.setAttribute("style", `${copy.getAttribute("style") ?? ""};${values};background:${getComputedStyle(document.body).backgroundColor}`);
	return new XMLSerializer().serializeToString(copy);
}

function TableCopy({ anchor }: { anchor: HTMLElement }) {
	const copy = (format: "Markdown" | "CSV") => {
		const table = anchor.closest(".message-table")?.querySelector("table");
		if (!table) return;
		const rows = tableRows(table);
		void navigator.clipboard.writeText(format === "CSV" ? tableCsv(rows) : tableMarkdown(rows)).then(() => showToast("success", `Table copied as ${format}`), () => showToast("error", "Could not copy the table"));
	};
	return <DropdownMenu>
		<DropdownMenuTrigger render={<button type="button" aria-label="Copy table" title="Copy table" className="message-table-copy" />}><Table2 size={13} />Copy table</DropdownMenuTrigger>
		<DropdownMenuContent align="start" className="w-44">
			<DropdownMenuItem onClick={() => copy("Markdown")}>Copy as Markdown</DropdownMenuItem>
			<DropdownMenuItem onClick={() => copy("CSV")}>Copy as CSV</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>;
}

type Target = { key: string; host: HTMLElement; fields: DOMStringMap; anchor: HTMLElement };

function portalFor({ fields, anchor, host }: Target, projectId: string | undefined): ReactNode {
	switch (fields.portal) {
		case "code": return <CodeActions block={anchor} host={host} />;
		case "chip": { try { return <MessageChip chip={JSON.parse(fields.chip ?? "") as Chip} projectId={projectId} />; } catch { return null; } }
		case "link": return <MessageLink href={fields.href}>{fields.label || undefined}</MessageLink>;
		case "image": return <MessageImage src={fields.src} alt={fields.alt} />;
		case "table-copy": return <TableCopy anchor={anchor} />;
		case "alert-icon": { const alert = messageAlerts[fields.kind as AlertKind]; return alert ? <alert.Icon aria-hidden className="size-4" /> : null; }
		default: return null;
	}
}

/**
 * Every `[data-portal]` placeholder Words wrote. Words owns those spans and may rewrite or replace them on any update,
 * so React renders into a host element of our own that is (re)attached to the current span after each patch.
 */
function usePortalTargets(root: React.RefObject<HTMLElement | null>) {
	const [targets, setTargets] = useState<Target[]>([]);
	const hosts = useRef(new Map<string, HTMLElement>());
	useLayoutEffect(() => {
		const element = root.current;
		if (!element) return;
		const attach = (key: string, slot: HTMLElement, className = "words-portal-host") => {
			let host = hosts.current.get(key);
			if (!host) { host = document.createElement("span"); host.className = className; hosts.current.set(key, host); }
			if (host.parentNode !== slot) slot.replaceChildren(host);
			return host;
		};
		const scan = () => {
			const seen = new Set<string>();
			const found = Array.from(element.querySelectorAll<HTMLElement>("[data-portal]")).map((node, index): Target => {
				const key = `${index}\u0000${JSON.stringify(node.dataset)}`;
				seen.add(key);
				return { key, host: attach(key, node), fields: { ...node.dataset }, anchor: node };
			});
			// Code blocks: the header's second span is empty with Words' own controls off; our actions go there.
			element.querySelectorAll<HTMLElement>('[data-markdown="code-block"]').forEach((block, index) => {
				const slot = block.querySelector<HTMLElement>(':scope > [data-markdown="code-header"] > span:last-child');
				if (!slot) return;
				// A diagram that has drawn gets diagram actions, so its key changes when the drawing appears.
				const drawn = block.querySelector('[data-markdown="mermaid"] svg') ? "diagram" : "";
				const key = `code\u0000${index}\u0000${block.dataset.language ?? ""}\u0000${drawn}`;
				seen.add(key);
				found.push({ key, host: attach(key, slot, "words-portal-host words-code-actions"), fields: { portal: "code" }, anchor: block });
			});
			for (const key of hosts.current.keys()) if (!seen.has(key)) hosts.current.delete(key);
			setTargets(previous => previous.length === found.length && previous.every((target, index) => target.key === found[index]?.key && target.anchor === found[index]?.anchor) ? previous : found);
		};
		scan();
		const observer = new MutationObserver(scan);
		observer.observe(element, { childList: true, subtree: true });
		return () => observer.disconnect();
	}, [root]);
	return targets;
}

/** One placeholder's component; memoised so a streamed update does not re-render every portal already shown. */
const Portal = memo(function Portal({ target, projectId }: { target: Target; projectId?: string }) { return createPortal(portalFor(target, projectId), target.host); }, (a, b) => a.target.key === b.target.key && a.target.anchor === b.target.anchor && a.projectId === b.projectId);

/** A single typed newline is a line break in what people write; fenced code keeps its lines. */
function hardLineBreaks(text: string) {
	let fence: string | undefined;
	return text.split("\n").map((line, index, lines) => {
		const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
		if (fence) { if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined; return line; }
		if (marker) { fence = marker; return line; }
		const next = lines[index + 1];
		return line.trim() && next !== undefined && next.trim() && !/^ {0,3}(`{3,}|~{3,})/.test(next) ? `${line}\\` : line;
	}).join("\n");
}

/** Markdown parts in order; `<details>` blocks become real `<details>` elements around their own parts. */
function Parts({ parts, path, streaming, prepared }: { parts: MarkdownPart[]; path: string; streaming: boolean; prepared: (path: string, markdown: string) => string }) {
	return parts.map((part, index) => {
		const key = `${path}${index}`;
		// Only the text still arriving animates: the last part, and inside it the last part again.
		const live = streaming && index === parts.length - 1;
		if (part.kind === "details") return <details key={key} className="message-details" open={part.open || undefined}>
			<summary>{part.summary || "Details"}</summary>
			<Parts parts={part.parts} path={`${key}.`} streaming={live && !part.complete} prepared={prepared} />
		</details>;
		return <Markdown key={key} isAnimating={live} math plugins={plugins} components={components} urlTransform={urlTransform} lineNumbers={false} controls={false}>{prepared(key, part.text)}</Markdown>;
	});
}

/** MessageContent drawn by Words. Chips, links, images, table copy and alert icons are the same React components, mounted into Words' HTML. */
export function WordsMessageContent({ text, projectId, repairLocalLinks = false, lineBreaks = false, streaming = false }: { text: string; projectId?: string; repairLocalLinks?: boolean; repository?: string; lineBreaks?: boolean; streaming?: boolean }) {
	const root = useRef<HTMLDivElement>(null);
	const targets = usePortalTargets(root);
	const parts = useMemo(() => splitDetails(repairLocalLinks ? repairFileLinks(text) : text), [text, repairLocalLinks]);
	// One prefix cache per part: streamed text grows, and only a part's unfinished end is prepared again.
	const caches = useRef(new Map<string, (markdown: string) => string>());
	const prepared = (path: string, markdown: string) => {
		let cache = caches.current.get(path);
		if (!cache) { cache = createMarkdownPrefixCache(value => chipMarkdown(lineBreaks ? hardLineBreaks(value) : value)); caches.current.set(path, cache); }
		return cache(markdown);
	};
	return <ProjectContext value={projectId}><ChipVariantContext value={lineBreaks ? "token" : "embedded"}>
		<div ref={root} className="message-markdown words-message">
			<Parts parts={parts} path="" streaming={streaming} prepared={prepared} />
			{targets.map(target => <Portal key={target.key} target={target} projectId={projectId} />)}
		</div>
	</ChipVariantContext></ProjectContext>;
}
