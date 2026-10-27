import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { ScrollArea } from "./ui/scroll-area";
import { Children, createContext, isValidElement, lazy, memo, Suspense, useContext, useEffect, useRef, useState, useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import type { CodeToken } from "./codeHighlight";
import { Check, Code2, Copy, Expand, ImageOff, Info, Lightbulb, MessageSquareWarning, OctagonAlert, Table2, TriangleAlert, WrapText, Workflow } from "lucide-react";
import { useTextCopy } from "./useTextCopy";
import { parseFileReference } from "../../shared/editors";
import { showToast } from "./ui/toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";

import type { Chip } from "../lib/messageChips";
import { FilePathChip, LinkChip, MessageChip } from "./MessageChips";
import { remarkMessageChips } from "./remarkMessageChips";
import { remarkPullRequestLinks } from "./remarkPullRequestLinks";
import { remarkMathGuard, remarkRichBlocks, type AlertKind } from "./remarkRichBlocks";
import { repairFileLinks } from "./repairFileLinks";
import type { PluggableList } from "unified";
import { tableCsv, tableMarkdown, tableRows } from "./markdownTable";
import { ImageViewer, type GalleryImage } from "./ImageViewer";

const MathTypeset = lazy(() => import("./MathTypeset"));
const MermaidDiagram = lazy(() => import("./MermaidDiagram"));

const ProjectContext = createContext<string | undefined>(undefined);

const nodeText = (node: ReactNode): string => typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(nodeText).join("") : isValidElement<{ children?: ReactNode }>(node) ? nodeText(node.props.children) : "";
const bareUrl = (value: string) => value.replace(/^https?:\/\//i, "").replace(/\/$/, "");

/** Whether the app is dark, kept current as the theme changes, so diagrams redraw in its colours. */
const watchTheme = (listener: () => void) => { const observer = new MutationObserver(listener); observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] }); return () => observer.disconnect(); };
const useDark = () => useSyncExternalStore(watchTheme, () => document.documentElement.classList.contains("dark"), () => false);

/** Markdown links as chips; link text that differs from the destination becomes the chip's label. */
function MessageLink({ href, children }: { href?: string; children?: ReactNode }) {
	const projectId = useContext(ProjectContext);
	const reference = href ? parseFileReference(href) : undefined;
	const label = nodeText(children);
	if (href && reference) {
		const file = { kind: /[\\/]$/.test(reference.filename) ? "folder" as const : "file" as const, path: reference.filename, ...(reference.line ? { line: reference.line } : {}), ...(reference.column ? { column: reference.column } : {}) };
		return <FilePathChip file={file} projectId={projectId}>{label && label !== href && label !== reference.filename ? children : undefined}</FilePathChip>;
	}
	if (href && /^https?:\/\//i.test(href)) return <LinkChip href={href}>{label && bareUrl(label) !== bareUrl(href) ? children : undefined}</LinkChip>;
	return <span>{children}</span>;
}

function MarkdownChip({ value }: { value: string }) {
	const projectId = useContext(ProjectContext);
	try { return <MessageChip chip={JSON.parse(value) as Chip} projectId={projectId} />; } catch { return null; }
}

/** Web and inline images load as they are; anything else is a path in the chat's project, read through the main process. */
export const imageSource = (src: string) => /^(https:|data:image\/)/i.test(src) ? { kind: "direct" as const, src } : /^[a-z][a-z0-9+.-]*:/i.test(src) && !/^file:/i.test(src) && !/^[a-z]:[\\/]/i.test(src) ? undefined : { kind: "project" as const, path: decodeURI(src.replace(/^file:\/\/\/?/i, "").replace(/[?#].*$/, "")) };

/** Images in a reply open in the viewer, which steps through every image in the same message. */
function MessageImage({ src, alt }: { src?: string; alt?: string }) {
	const projectId = useContext(ProjectContext);
	const source = src ? imageSource(src) : undefined;
	const [local, setLocal] = useState<{ path: string; src?: string; error?: string }>();
	const [viewer, setViewer] = useState<{ images: GalleryImage[]; index: number }>();
	const [failed, setFailed] = useState(false);
	const path = source?.kind === "project" ? source.path : undefined;
	useEffect(() => {
		if (!path || !projectId) return;
		const api = window.phaseoDesktop?.workspace;
		if (!api) return;
		let active = true;
		void api.filePreview(projectId, path).then(preview => { if (active) setLocal(preview.kind === "image" ? { path, src: preview.dataUrl } : { path, error: "Not an image" }); }, () => { if (active) setLocal({ path, error: "Not found" }); });
		return () => { active = false; };
	}, [path, projectId]);
	const shown = source?.kind === "direct" ? source.src : local?.path === path ? local?.src : undefined;
	const label = alt || "Image";
	if (!shown || failed) return <span className="message-image-missing" title={src}><ImageOff aria-hidden className="size-3.5" />{label}</span>;
	const open = (element: HTMLElement) => {
		const scope = element.closest(".message-markdown") ?? element.parentElement;
		const images = Array.from(scope?.querySelectorAll<HTMLImageElement>("img[data-message-image]") ?? [], image => ({ src: image.currentSrc || image.src, alt: image.alt, ...(image.dataset.href ? { href: image.dataset.href } : {}) }));
		const index = Array.from(scope?.querySelectorAll("img[data-message-image]") ?? []).indexOf(element.querySelector("img")!);
		setViewer(images.length && index >= 0 ? { images, index } : { images: [{ src: shown, alt: label }], index: 0 });
	};
	return <>
		<button type="button" className="message-image" aria-label={`Open image: ${label}`} onClick={event => open(event.currentTarget)}>
			<img data-message-image="" data-href={source?.kind === "direct" && src?.startsWith("https:") ? src : undefined} src={shown} alt={label} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
		</button>
		{viewer && <ImageViewer images={viewer.images} index={viewer.index} onClose={() => setViewer(undefined)} />}
	</>;
}

function messageUrl(href: string, key: string) { return key === "src" ? href : parseFileReference(href) ? href : defaultUrlTransform(href); }

/** One formula: its TeX until KaTeX loads, and when KaTeX cannot read it (often mid-stream). */
function MessageMath({ tex, display }: { tex: string; display: boolean }) {
	const source = display ? `$$\n${tex.trim()}\n$$` : `$${tex.trim()}$`;
	const fallback = <span className="message-math-source">{source}</span>;
	return <span className={display ? "message-math-display" : "message-math-inline"} role="group" aria-label={display ? "Equation" : "Inline equation"} data-markdown-copy={source}>
		<Suspense fallback={fallback}><MathTypeset tex={tex.trim()} display={display} fallback={fallback} /></Suspense>
	</span>;
}

function codeOf(children: ReactNode) {
	const child = Children.toArray(children)[0];
	const element = isValidElement<{ className?: string; children?: ReactNode }>(child) ? child : undefined;
	return { className: element?.props.className ?? "", text: typeof element?.props.children === "string" ? element.props.children : nodeText(element?.props.children) };
}

function CodeAction({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: ReactNode }) {
	return <button type="button" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick} className="message-code-icon">{children}</button>;
}

/** `actions` sit before Copy; `body` replaces the code (a diagram). Long lines scroll sideways until Wrap is on. */
export function CodeBlock({ children, text: source, language: sourceLanguage, actions, body }: { children?: ReactNode; text?: string; language?: string; actions?: ReactNode; body?: ReactNode }) {
	const code = codeOf(children);
	const language = sourceLanguage ?? /^language-([\w+#-]+)/.exec(code.className)?.[1]?.toLowerCase() ?? "";
	const text = source ?? code.text;
	const { status, copying, copy } = useTextCopy(text);
	const [wrap, setWrap] = useState(false);
	const [highlight, setHighlight] = useState<{ text: string; language: string; tokens: CodeToken[][] }>();
	useEffect(() => {
		let active = true;
		if (!language || !text || body) return;
		const timer = setTimeout(() => {
			void import("./codeHighlight").then(module => module.highlightCode(text, language)).then(tokens => { if (active && tokens) setHighlight({ text, language, tokens }); }).catch(() => {});
		}, 150);
		return () => { active = false; clearTimeout(timer); };
	}, [text, language, body]);
	const tokens = highlight?.text === text && highlight.language === language ? highlight.tokens : undefined;
	return <div className="message-code-block">
		<div className="message-code-actions">
			<span aria-live="polite">{status === "failed" ? "Copy failed" : language || "Code"}</span>
			<span className="message-code-buttons">
				{actions}
				{!body && <CodeAction label={wrap ? "Scroll long lines" : "Wrap long lines"} pressed={wrap} onClick={() => setWrap(value => !value)}><WrapText size={14} /></CodeAction>}
				<button type="button" onClick={() => void copy()} disabled={copying} aria-label={status === "copied" ? "Copied" : "Copy code"}>{status === "copied" ? <Check size={14} /> : <Copy size={14} />}{status === "copied" ? "Copied" : "Copy code"}</button>
			</span>
		</div>
		{body ?? <ScrollArea scrollBarOrientation="horizontal"><pre data-wrap={wrap ? "" : undefined}>{tokens ? <code>{tokens.map((line, index) => <span key={index}>{index > 0 ? "\n" : ""}{line.map((token, tokenIndex) => <span className="code-token" key={tokenIndex} style={{ "--code-light": token.light, "--code-dark": token.dark } as CSSProperties}>{token.content}</span>)}</span>)}</code> : children ?? <code>{text}</code>}</pre></ScrollArea>}
	</div>;
}

/** A `mermaid` fence as its diagram, with the source a click away. A diagram that cannot render yet shows its code. */
function MermaidBlock({ text, children }: { text: string; children: ReactNode }) {
	const dark = useDark();
	const [showCode, setShowCode] = useState(false);
	const [result, setResult] = useState<{ source: string; svg?: string; error?: string }>();
	const [viewer, setViewer] = useState<GalleryImage>();
	const current = result?.source === text ? result : undefined;
	const diagram = !showCode && !current?.error;
	return <>
		<CodeBlock text={text} language="mermaid" actions={<>
			{diagram && current?.svg && <CodeAction label="Expand diagram" onClick={() => setViewer({ src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(current.svg!)}`, alt: "Diagram" })}><Expand size={14} /></CodeAction>}
			{!current?.error && <CodeAction label={showCode ? "Show diagram" : "Show code"} onClick={() => setShowCode(value => !value)}>{showCode ? <Workflow size={14} /> : <Code2 size={14} />}</CodeAction>}
		</>} body={diagram ? <div className="message-diagram-frame">
			<Suspense fallback={null}>
				<MermaidDiagram source={text} dark={dark} onRendered={svg => setResult({ source: text, svg })} onFailure={error => setResult({ source: text, error })} />
			</Suspense>
			{!current?.svg && <pre className="message-diagram-pending">{text}</pre>}
		</div> : undefined}>{children}</CodeBlock>
		{current?.error && !showCode && <p className="message-diagram-error">The diagram could not be drawn: {current.error.split("\n")[0]}</p>}
		{viewer && <ImageViewer images={[viewer]} index={0} onClose={() => setViewer(undefined)} />}
	</>;
}

const alerts: Record<AlertKind, { label: string; Icon: typeof Info }> = {
	note: { label: "Note", Icon: Info }, tip: { label: "Tip", Icon: Lightbulb }, important: { label: "Important", Icon: MessageSquareWarning },
	warning: { label: "Warning", Icon: TriangleAlert }, caution: { label: "Caution", Icon: OctagonAlert },
};

/** A table that scrolls sideways, with Copy as Markdown and Copy as CSV under it. */
function MessageTable({ children }: { children?: ReactNode }) {
	const table = useRef<HTMLTableElement>(null);
	const copy = (format: "Markdown" | "CSV") => {
		if (!table.current) return;
		const rows = tableRows(table.current);
		void navigator.clipboard.writeText(format === "CSV" ? tableCsv(rows) : tableMarkdown(rows)).then(() => showToast("success", `Table copied as ${format}`), () => showToast("error", "Could not copy the table"));
	};
	return <div className="message-table">
		<ScrollArea scrollBarOrientation="horizontal" className="message-table-scroll"><table ref={table}>{children}</table></ScrollArea>
		<DropdownMenu>
			<DropdownMenuTrigger render={<button type="button" aria-label="Copy table" title="Copy table" className="message-table-copy" />}><Table2 size={13} />Copy table</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-44">
				<DropdownMenuItem onClick={() => copy("Markdown")}>Copy as Markdown</DropdownMenuItem>
				<DropdownMenuItem onClick={() => copy("CSV")}>Copy as CSV</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	</div>;
}

const markdownComponents: Components = {
		a: ({ href, children }) => <MessageLink key={href} href={href}>{children}</MessageLink>,
		img: ({ src, alt }) => <MessageImage src={typeof src === "string" ? src : undefined} alt={alt} />,
		// Spans only come from remarkMessageChips; raw HTML is not rendered.
		span: props => { const chip = (props as Record<string, unknown>)["data-chip"]; return typeof chip === "string" ? <MarkdownChip value={chip} /> : <span className={props.className}>{props.children}</span>; },
		code: ({ className, children }) => /\bmath-inline\b/.test(className ?? "") ? <MessageMath tex={nodeText(children)} display={false} /> : <code className={className}>{children}</code>,
		pre: ({ children }) => {
			const { className, text } = codeOf(children);
			if (/\bmath-display\b/.test(className)) return <MessageMath tex={text} display />;
			if (/^language-mermaid\b/.test(className) && text.trim()) return <MermaidBlock text={text.replace(/\n$/, "")}>{children}</MermaidBlock>;
			return <CodeBlock>{children}</CodeBlock>;
		},
		table: ({ children }) => <MessageTable>{children}</MessageTable>,
		// GitHub's alerts, in the app's callout style: a tinted box with the kind's icon and name.
		blockquote: props => {
			const kind = (props as Record<string, unknown>)["data-alert"] as AlertKind | undefined, alert = kind ? alerts[kind] : undefined;
			if (!alert) return <blockquote>{props.children}</blockquote>;
			return <div role="note" className="message-alert" data-alert={kind}><p className="message-alert-title" data-find-ignore><alert.Icon aria-hidden className="size-4" />{alert.label}</p>{props.children}</div>;
		},
		details: ({ children, open }) => <details className="message-details" open={open}>{children}</details>,
		summary: ({ children }) => <summary>{children}</summary>,
};

// remark-math first, so the guard and chips see its nodes; single dollars follow Pandoc's rule (remarkMathGuard).
const mathPlugin: PluggableList[number] = [remarkMath, { singleDollarTextMath: true }];
const markdownPlugins: PluggableList = [mathPlugin, remarkMathGuard, remarkGfm, remarkRichBlocks, remarkMessageChips];

/**
 * `repository` links `#123` and commit SHAs into that GitHub repository and plays GitHub video uploads, as pull request comments do.
 * Memoised: a long chat re-renders on every streamed update, and parsing Markdown is most of the cost of each message.
 */
export const MessageContent = memo(function MessageContent({ text, projectId, repairLocalLinks = false, repository }: { text: string; projectId?: string; repairLocalLinks?: boolean; repository?: string }) {
	const rendered = useMemo(() => repairLocalLinks ? repairFileLinks(text) : text, [text, repairLocalLinks]);
	const plugins = useMemo((): PluggableList => repository ? [mathPlugin, remarkMathGuard, remarkGfm, remarkRichBlocks, remarkPullRequestLinks({ repository }), remarkMessageChips] : markdownPlugins, [repository]);
	return <ProjectContext value={projectId}><div className="message-markdown"><ReactMarkdown remarkPlugins={plugins} components={markdownComponents} urlTransform={messageUrl}>{rendered}</ReactMarkdown></div></ProjectContext>;
});
