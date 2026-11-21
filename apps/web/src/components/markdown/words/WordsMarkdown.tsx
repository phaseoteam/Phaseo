"use client";

import { Markdown, type Components, type PluginConfig } from "@pierre/words/react";
import { escapeHtml } from "@pierre/words/html";
import { createHighlightsPlugin } from "@pierre/words/highlights";
import { createMermaidPlugin } from "@pierre/words/mermaid";
import githubLight from "@pierre/highlights/themes/github-light";
import githubDark from "@pierre/highlights/themes/github-dark";
import { render as renderMermaid } from "pele";
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { memo, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CHIP_LINK_SCHEME, chipFromLinkUrl } from "@phaseo/app-kit/message-chips-markdown";
import { createMarkdownPrefixCache } from "@phaseo/app-kit/markdown-prefix-cache";
import { splitDetails, type MarkdownPart } from "@phaseo/app-kit/markdown-details";
import type { Chip } from "@phaseo/app-kit/message-chips";
import { useTranslations } from "@/i18n/react";
// words.css imports Words' own styles.css into a layer under these rules.
import "./words.css";

/** Chip links survive Words' URL filter as this relative path; the `a` hook swaps them for chip placeholders. */
const CHIP_PATH = "/__phaseo-chip/";

function urlTransform(url: string) {
	return url.startsWith(CHIP_LINK_SCHEME) ? CHIP_PATH + encodeURIComponent(url) : url;
}

/** `<a href="/__phaseo-chip/…">label</a>` → an empty `<span data-chip>` the chip portals into. */
function chipAnchor(html: string) {
	const href = /\shref="([^"]*)"/.exec(html)?.[1];
	if (!href?.startsWith(CHIP_PATH)) return html;
	let chip: Chip | undefined;
	try { chip = chipFromLinkUrl(decodeURIComponent(href.slice(CHIP_PATH.length).replace(/&amp;/g, "&"))); } catch { /* Malformed: plain text. */ }
	const label = html.replace(/^<a\b[^>]*>/, "").replace(/<\/a>$/, "");
	if (!chip) return `<span>${label}</span>`;
	return `<span class="words-chip" data-chip="${escapeHtml(JSON.stringify(chip))}"></span>`;
}

/** Streamdown's table frame: actions above, the table scrolling sideways below. */
const wrapTable = (html: string) => `<div class="words-table-frame"><div class="words-table-actions" data-table-actions></div><div class="words-table">${html}</div></div>`;
const chipComponents: Components = { a: chipAnchor, table: wrapTable };
const plainComponents: Components = { table: wrapTable };

/**
 * Pele draws with CSS variables (mapped to the app's tokens in words.css), so diagrams follow the theme without
 * drawing again. A diagram wider than the chat column turns from left-to-right to top-to-bottom, keeping its text
 * at reading size instead of shrinking it.
 */
const mermaidOptions = { maxWidth: 700, directionBreakpoint: 100_000, fontSize: 14 };

const sharedPlugins: PluginConfig = {
	code: createHighlightsPlugin({ themes: { light: githubLight, dark: githubDark } }),
	mermaid: createMermaidPlugin({ render: renderMermaid }, mermaidOptions),
};
const noMermaidPlugins: PluginConfig = { code: sharedPlugins.code };

export type WordsMarkdownProps = {
	children: string;
	isStreaming?: boolean;
	className?: string;
	/** Renders each chip placeholder; answers pass MessageChip. Without it, chip links stay plain links. */
	renderChip?: (chip: Chip) => ReactNode;
	/** A line-based transform (chips, maths) run on each Markdown part; streamed text only re-runs its unfinished end. */
	prepare?: (markdown: string) => string;
	math?: boolean;
	mermaid?: boolean;
};

type Target =
	| { key: string; host: HTMLElement; kind: "chip"; chip: string }
	| { key: string; host: HTMLElement; kind: "code"; block: HTMLElement }
	| { key: string; host: HTMLElement; kind: "table"; frame: HTMLElement };

/**
 * Mounts React into Words' HTML: a chip into every `span[data-chip]`, code actions into each code header's empty
 * slot, and table actions above each table. Words owns those elements and may rewrite or replace them on any update,
 * so React renders into a host element of our own, which is (re)attached to the current element after each patch.
 * React never removes nodes from an element Words changed, and a chip keeps its state while it streams.
 */
function usePortalTargets(root: React.RefObject<HTMLElement | null>, chips: boolean) {
	const [targets, setTargets] = useState<Target[]>([]);
	const hosts = useRef(new Map<string, HTMLElement>());
	useLayoutEffect(() => {
		const element = root.current;
		if (!element) return;
		const host = (key: string, slot: HTMLElement) => {
			let node = hosts.current.get(key);
			if (!node) { node = document.createElement("span"); node.className = "words-portal-host"; hosts.current.set(key, node); }
			if (node.parentNode !== slot) slot.replaceChildren(node);
			return node;
		};
		const scan = () => {
			const found: Target[] = [];
			if (chips) element.querySelectorAll<HTMLElement>("span[data-chip]").forEach((node, index) => {
				const chip = node.dataset.chip ?? "";
				const key = `chip\u0000${index}\u0000${chip}`;
				found.push({ key, host: host(key, node), kind: "chip", chip });
			});
			element.querySelectorAll<HTMLElement>('[data-markdown="code-block"]').forEach((block, index) => {
				const slot = block.querySelector<HTMLElement>(':scope > [data-markdown="code-header"] > span:last-child');
				if (!slot) return;
				const key = `code\u0000${index}\u0000${block.dataset.language ?? ""}`;
				found.push({ key, host: host(key, slot), kind: "code", block });
			});
			element.querySelectorAll<HTMLElement>("[data-table-actions]").forEach((slot, index) => {
				const key = `table\u0000${index}`;
				found.push({ key, host: host(key, slot), kind: "table", frame: slot.parentElement! });
			});
			const seen = new Set(found.map((target) => target.key));
			for (const key of hosts.current.keys()) if (!seen.has(key)) hosts.current.delete(key);
			setTargets((previous) => previous.length === found.length && previous.every((target, index) => target.key === found[index]?.key && sameAnchor(target, found[index]!)) ? previous : found);
		};
		scan();
		const observer = new MutationObserver(scan);
		observer.observe(element, { childList: true, subtree: true });
		return () => observer.disconnect();
	}, [root, chips]);
	return targets;
}

const sameAnchor = (a: Target, b: Target) => a.kind === "code" && b.kind === "code" ? a.block === b.block : a.kind === "table" && b.kind === "table" ? a.frame === b.frame : true;

/** Copies `text`, showing a tick for two seconds. */
function useCopied() {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => {
		setCopied(true);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setCopied(false), 2000);
	}, () => {});
	return { copied, copy };
}

function download(name: string, text: string, type = "text/plain") {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const link = Object.assign(document.createElement("a"), { href: url, download: name });
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

const EXTENSIONS: Record<string, string> = { typescript: "ts", javascript: "js", python: "py", ruby: "rb", rust: "rs", shell: "sh", bash: "sh", zsh: "sh", markdown: "md", yaml: "yml", text: "txt", mermaid: "mmd" };
const codeOf = (block: HTMLElement) => block.dataset.code !== undefined
	? block.dataset.code
	: block.querySelector('[data-markdown="code-lines"]')?.textContent?.replace(/\n$/, "") ?? block.querySelector("code")?.textContent ?? "";

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
	return <button type="button" className="words-action" title={label} aria-label={label} onClick={onClick}>{children}</button>;
}

/** Streamdown's code actions: Download and Copy, as icons. Mermaid diagrams copy and download their source. */
function CodeActions({ block }: { block: HTMLElement }) {
	const t = useTranslations("Common.ui.wordsMarkdown");
	const { copied, copy } = useCopied();
	const language = block.dataset.language || "text";
	return <>
		<ActionButton label={t("downloadFile")} onClick={() => download(`file.${EXTENSIONS[language] ?? language}`, codeOf(block))}><DownloadIcon size={14} /></ActionButton>
		<ActionButton label={copied ? t("copied") : t("copyCode")} onClick={() => copy(codeOf(block))}>{copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}</ActionButton>
	</>;
}

const cellText = (cell: Element) => (cell.textContent ?? "").replace(/\s+/g, " ").trim();
function tableRows(frame: HTMLElement) {
	return Array.from(frame.querySelectorAll("table tr"), (row) => Array.from(row.querySelectorAll("th, td"), cellText));
}
const markdownTable = (rows: string[][]) => rows.map((row, index) => {
	const line = `| ${row.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`;
	return index === 0 ? `${line}\n|${row.map(() => " --- ").join("|")}|` : line;
}).join("\n");
const csvTable = (rows: string[][]) => rows.map((row) => row.map((cell) => /[",\n]/.test(cell) ? `"${cell.replace(/"/g, "\"\"")}"` : cell).join(",")).join("\n");

/** Streamdown's table actions: Copy (as Markdown) and Download (as CSV). */
function TableActions({ frame }: { frame: HTMLElement }) {
	const t = useTranslations("Common.ui.wordsMarkdown");
	const { copied, copy } = useCopied();
	return <>
		<ActionButton label={copied ? t("copied") : t("copyTable")} onClick={() => copy(markdownTable(tableRows(frame)))}>{copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}</ActionButton>
		<ActionButton label={t("downloadCsv")} onClick={() => download("table.csv", csvTable(tableRows(frame)), "text/csv")}><DownloadIcon size={14} /></ActionButton>
	</>;
}

/** One mounted element; memoised so a streamed update does not re-render every chip or action already shown. */
const Portal = memo(function Portal({ target, render }: { target: Target; render?: (chip: Chip) => ReactNode }) {
	const content = target.kind === "chip" ? render?.(JSON.parse(target.chip) as Chip) : target.kind === "code" ? <CodeActions block={target.block} /> : <TableActions frame={target.frame} />;
	return createPortal(content, target.host);
}, (a, b) => a.target.key === b.target.key && sameAnchor(a.target, b.target) && a.render === b.render);

type PartsProps = { parts: MarkdownPart[]; path: string; streaming: boolean; prepared: (path: string, text: string) => string; components: Components; plugins: PluginConfig; math: boolean; urlTransform?: (url: string) => string };

/** Markdown parts in order; `<details>` blocks become real `<details>` elements around their own parts. */
function Parts({ parts, path, streaming, prepared, ...shared }: PartsProps) {
	const t = useTranslations("Common.ui.wordsMarkdown");
	return parts.map((part, index) => {
		const key = `${path}${index}`;
		// Only the text still arriving animates: the last part, and inside it the last part again.
		const live = streaming && index === parts.length - 1;
		if (part.kind === "details") return (
			<details key={key} className="words-details" open={part.open || undefined}>
				<summary>{part.summary || t("details")}</summary>
				<Parts parts={part.parts} path={`${key}.`} streaming={live && !part.complete} prepared={prepared} {...shared} />
			</details>
		);
		return <Markdown key={key} className="words-markdown" isAnimating={live} controls={false} {...shared}>{prepared(key, part.text)}</Markdown>;
	});
}

export function WordsMarkdown({ children, isStreaming = false, className, renderChip, prepare, math = true, mermaid = true }: WordsMarkdownProps) {
	const root = useRef<HTMLDivElement>(null);
	const targets = usePortalTargets(root, !!renderChip);
	const parts = useMemo(() => splitDetails(children), [children]);
	// One prefix cache per part, so a streamed part only prepares its unfinished end again.
	const caches = useRef(new Map<string, (text: string) => string>());
	const prepared = (path: string, text: string) => {
		if (!prepare) return text;
		let cache = caches.current.get(path);
		if (!cache) { cache = createMarkdownPrefixCache(prepare); caches.current.set(path, cache); }
		return cache(text);
	};
	return (
		<div ref={root} className={className ? `words-parts ${className}` : "words-parts"}>
			<Parts
				parts={parts}
				path=""
				streaming={isStreaming}
				prepared={prepared}
				math={math}
				plugins={mermaid ? sharedPlugins : noMermaidPlugins}
				components={renderChip ? chipComponents : plainComponents}
				urlTransform={renderChip ? urlTransform : undefined}
			/>
			{targets.map((target) => <Portal key={target.key} target={target} render={renderChip} />)}
		</div>
	);
}
