import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Children, isValidElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { CodeToken } from "./codeHighlight";
import { Check, Copy } from "lucide-react";

function CodeBlock({ children }: { children?: ReactNode }) {
	const code = useRef<HTMLPreElement>(null);
	const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
	const [copying, setCopying] = useState(false);
	const child = Children.toArray(children)[0];
	const element = isValidElement<{ className?: string; children?: ReactNode }>(child) ? child : undefined;
	const language = /^language-([\w+#-]+)$/.exec(element?.props.className ?? "")?.[1]?.toLowerCase() ?? "";
	const text = typeof element?.props.children === "string" ? element.props.children : "";
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
	useEffect(() => { setStatus("idle"); }, [text, language]);
	useEffect(() => { if (status === "idle") return; const timeout = setTimeout(() => setStatus("idle"), 2000); return () => clearTimeout(timeout); }, [status]);
	async function copy() {
		const text = code.current?.textContent; if (text === undefined || text === null) return;
		setCopying(true);
		try { await navigator.clipboard.writeText(text); if (code.current?.textContent === text) setStatus("copied"); }
		catch { if (code.current?.textContent === text) setStatus("failed"); }
		finally { setCopying(false); }
	}
	return <div className="message-code-block"><div className="message-code-actions"><span aria-live="polite">{status === "failed" ? "Copy failed" : language || "Code"}</span><button type="button" onClick={() => void copy()} disabled={copying} aria-label={status === "copied" ? "Copied" : "Copy code"}>{status === "copied" ? <Check size={14} /> : <Copy size={14} />}{status === "copied" ? "Copied" : "Copy code"}</button></div><pre ref={code}>{tokens ? <code>{tokens.map((line, index) => <span key={index}>{index > 0 ? "\n" : ""}{line.map((token, tokenIndex) => <span className="code-token" key={tokenIndex} style={{ "--code-light": token.light, "--code-dark": token.dark } as CSSProperties}>{token.content}</span>)}</span>)}</code> : children}</pre></div>;
}

const markdownComponents: Components = {
		a: ({ href, children }) => {
			const safe = typeof href === "string" && /^https?:\/\//i.test(href);
			return safe ? <a href={href} target="_blank" rel="noreferrer" onClick={event => { if (window.phaseoDesktop?.workspace) { event.preventDefault(); void window.phaseoDesktop.workspace.openLink(href).catch(() => {}); } }}>{children}</a> : <span>{children}</span>;
		},
		img: ({ alt }) => <span>{alt || "Image"}</span>,
		pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
};

export function MessageContent({ text }: { text: string }) {
	return <div className="message-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{text}</ReactMarkdown></div>;
}
