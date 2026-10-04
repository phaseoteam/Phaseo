import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

function CodeBlock({ children }: { children?: ReactNode }) {
	const code = useRef<HTMLPreElement>(null);
	const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
	const [copying, setCopying] = useState(false);
	useEffect(() => { setStatus("idle"); }, [children]);
	useEffect(() => { if (status === "idle") return; const timeout = setTimeout(() => setStatus("idle"), 2000); return () => clearTimeout(timeout); }, [status]);
	async function copy() {
		const text = code.current?.textContent; if (text === undefined || text === null) return;
		setCopying(true);
		try { await navigator.clipboard.writeText(text); if (code.current?.textContent === text) setStatus("copied"); }
		catch { if (code.current?.textContent === text) setStatus("failed"); }
		finally { setCopying(false); }
	}
	return <div className="message-code-block"><div className="message-code-actions"><span aria-live="polite">{status === "failed" ? "Copy failed" : "Code"}</span><button type="button" onClick={() => void copy()} disabled={copying} aria-label={status === "copied" ? "Copied" : "Copy code"}>{status === "copied" ? <Check size={14} /> : <Copy size={14} />}{status === "copied" ? "Copied" : "Copy code"}</button></div><pre ref={code}>{children}</pre></div>;
}

export function MessageContent({ text }: { text: string }) {
	return <div className="message-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
		a: ({ href, children }) => {
			const safe = typeof href === "string" && /^https?:\/\//i.test(href);
			return safe ? <a href={href} target="_blank" rel="noreferrer" onClick={event => { if (window.phaseoDesktop?.workspace) { event.preventDefault(); void window.phaseoDesktop.workspace.openLink(href).catch(() => {}); } }}>{children}</a> : <span>{children}</span>;
		},
		img: ({ alt }) => <span>{alt || "Image"}</span>,
		pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
	}}>{text}</ReactMarkdown></div>;
}
