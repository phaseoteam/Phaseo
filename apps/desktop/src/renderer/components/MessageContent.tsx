import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollArea } from "./ui/scroll-area";
import { Children, createContext, isValidElement, memo, useContext, useEffect, useState, useMemo, type CSSProperties, type ReactNode } from "react";
import type { CodeToken } from "./codeHighlight";
import { Check, Copy } from "lucide-react";
import { useTextCopy } from "./useTextCopy";
import { parseFileReference } from "../../shared/editors";

import type { Chip } from "../lib/messageChips";
import { FilePathChip, LinkChip, MessageChip } from "./MessageChips";
import { remarkMessageChips } from "./remarkMessageChips";
import { remarkPullRequestLinks } from "./remarkPullRequestLinks";
import { repairFileLinks } from "./repairFileLinks";

const ProjectContext = createContext<string | undefined>(undefined);

const nodeText = (node: ReactNode): string => typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(nodeText).join("") : isValidElement<{ children?: ReactNode }>(node) ? nodeText(node.props.children) : "";
const bareUrl = (value: string) => value.replace(/^https?:\/\//i, "").replace(/\/$/, "");

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

function messageUrl(href: string) { return parseFileReference(href) ? href : defaultUrlTransform(href); }

export function CodeBlock({ children, text: source, language: sourceLanguage }: { children?: ReactNode; text?: string; language?: string }) {
	const child = Children.toArray(children)[0];
	const element = isValidElement<{ className?: string; children?: ReactNode }>(child) ? child : undefined;
	const language = sourceLanguage ?? /^language-([\w+#-]+)$/.exec(element?.props.className ?? "")?.[1]?.toLowerCase() ?? "";
	const text = source ?? (typeof element?.props.children === "string" ? element.props.children : "");
	const { status, copying, copy } = useTextCopy(text);
	const [highlight, setHighlight] = useState<{ text: string; language: string; tokens: CodeToken[][] }>();
	useEffect(() => {
		let active = true;
		if (!language || !text) return;
		const timer = setTimeout(() => {
			void import("./codeHighlight").then(module => module.highlightCode(text, language)).then(tokens => { if (active && tokens) setHighlight({ text, language, tokens }); }).catch(() => {});
		}, 150);
		return () => { active = false; clearTimeout(timer); };
	}, [text, language]);
	const tokens = highlight?.text === text && highlight.language === language ? highlight.tokens : undefined;
	return <div className="message-code-block"><div className="message-code-actions"><span aria-live="polite">{status === "failed" ? "Copy failed" : language || "Code"}</span><button type="button" onClick={() => void copy()} disabled={copying} aria-label={status === "copied" ? "Copied" : "Copy code"}>{status === "copied" ? <Check size={14} /> : <Copy size={14} />}{status === "copied" ? "Copied" : "Copy code"}</button></div><ScrollArea scrollBarOrientation="horizontal"><pre>{tokens ? <code>{tokens.map((line, index) => <span key={index}>{index > 0 ? "\n" : ""}{line.map((token, tokenIndex) => <span className="code-token" key={tokenIndex} style={{ "--code-light": token.light, "--code-dark": token.dark } as CSSProperties}>{token.content}</span>)}</span>)}</code> : children ?? <code>{text}</code>}</pre></ScrollArea></div>;
}

const markdownComponents: Components = {
		a: ({ href, children }) => <MessageLink key={href} href={href}>{children}</MessageLink>,
		img: ({ alt }) => <span>{alt || "Image"}</span>,
		// Spans only come from remarkMessageChips; raw HTML is not rendered.
		span: props => { const chip = (props as Record<string, unknown>)["data-chip"]; return typeof chip === "string" ? <MarkdownChip value={chip} /> : <span className={props.className}>{props.children}</span>; },
		pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
		// Wide tables scroll sideways inside a ScrollArea rather than with a native scroll bar.
		table: ({ children }) => <ScrollArea scrollBarOrientation="horizontal" className="message-table-scroll"><table>{children}</table></ScrollArea>,
};

const markdownPlugins = [remarkGfm, remarkMessageChips];

/**
 * `repository` links `#123` and commit SHAs into that GitHub repository and plays GitHub video uploads, as pull request comments do.
 * Memoised: a long chat re-renders on every streamed update, and parsing Markdown is most of the cost of each message.
 */
export const MessageContent = memo(function MessageContent({ text, projectId, repairLocalLinks = false, repository }: { text: string; projectId?: string; repairLocalLinks?: boolean; repository?: string }) {
	const rendered = useMemo(() => repairLocalLinks ? repairFileLinks(text) : text, [text, repairLocalLinks]);
	const plugins = useMemo(() => repository ? [remarkGfm, remarkPullRequestLinks({ repository }), remarkMessageChips] : markdownPlugins, [repository]);
	return <ProjectContext value={projectId}><div className="message-markdown"><ReactMarkdown remarkPlugins={plugins} components={markdownComponents} urlTransform={messageUrl}>{rendered}</ReactMarkdown></div></ProjectContext>;
});
