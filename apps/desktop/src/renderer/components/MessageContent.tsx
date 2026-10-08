import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Children, createContext, isValidElement, useContext, useEffect, useRef, useState, useMemo, type CSSProperties, type ReactNode } from "react";
import type { CodeToken } from "./codeHighlight";
import { Check, Copy } from "lucide-react";
import { useTextCopy } from "./useTextCopy";
import { parseFileReference } from "../../shared/editors";

import { repairFileLinks } from "./repairFileLinks";

const ProjectContext = createContext<string | undefined>(undefined);

function MessageLink({ href, children }: { href?: string; children?: ReactNode }) {
	const projectId = useContext(ProjectContext);
	const pending = useRef(false);
	const [busy, setBusy] = useState(false), [error, setError] = useState("");
	const reference = href ? parseFileReference(href) : undefined;
	async function openFile() {
		const api = window.phaseoDesktop?.workspace;
		if (!api || !projectId || !reference || pending.current) return;
		pending.current = true; setBusy(true); setError("");
		try {
			const editors = await api.editors();
			let preferred: unknown;
			try { preferred = JSON.parse(localStorage.getItem("phaseo.desktop.editor") ?? "null"); } catch { /* Fall back to an available editor. */ }
			const editor = editors.find(editor => editor.available && editor.id === preferred) ?? editors.find(editor => editor.available);
			if (!editor) throw new Error("Install an editor and select it in Projects.");
			await api.openProject(projectId, { editor: editor.id, ...reference });
		} catch (reason) { setError(String(reason).replace(/^Error: (?:Error invoking remote method '[^']+': (?:Error: )?)?/, "")); }
		finally { pending.current = false; setBusy(false); }
	}
	if (reference && projectId) return <span><button type="button" className="message-file-link" disabled={busy} aria-label={`Open ${reference.filename}${reference.line ? ` at line ${reference.line}` : ""} in editor`} onClick={() => void openFile()}>{children}</button>{busy && <span className="message-link-feedback" role="status">Opening…</span>}{error && <span className="message-link-feedback" role="alert">{error}</span>}</span>;
	const safe = typeof href === "string" && /^https?:\/\//i.test(href);
	return safe ? <a href={href} target="_blank" rel="noreferrer" onClick={event => { if (window.phaseoDesktop?.workspace) { event.preventDefault(); void window.phaseoDesktop.workspace.openLink(href).catch(() => {}); } }}>{children}</a> : <span>{children}</span>;
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
	return <div className="message-code-block"><div className="message-code-actions"><span aria-live="polite">{status === "failed" ? "Copy failed" : language || "Code"}</span><button type="button" onClick={() => void copy()} disabled={copying} aria-label={status === "copied" ? "Copied" : "Copy code"}>{status === "copied" ? <Check size={14} /> : <Copy size={14} />}{status === "copied" ? "Copied" : "Copy code"}</button></div><pre>{tokens ? <code>{tokens.map((line, index) => <span key={index}>{index > 0 ? "\n" : ""}{line.map((token, tokenIndex) => <span className="code-token" key={tokenIndex} style={{ "--code-light": token.light, "--code-dark": token.dark } as CSSProperties}>{token.content}</span>)}</span>)}</code> : children ?? <code>{text}</code>}</pre></div>;
}

const markdownComponents: Components = {
		a: ({ href, children }) => <MessageLink key={href} href={href}>{children}</MessageLink>,
		img: ({ alt }) => <span>{alt || "Image"}</span>,
		pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
};

export function MessageContent({ text, projectId, repairLocalLinks = false }: { text: string; projectId?: string; repairLocalLinks?: boolean }) {
	const rendered = useMemo(() => repairLocalLinks ? repairFileLinks(text) : text, [text, repairLocalLinks]);
	return <ProjectContext value={projectId}><div className="message-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} urlTransform={messageUrl}>{rendered}</ReactMarkdown></div></ProjectContext>;
}
