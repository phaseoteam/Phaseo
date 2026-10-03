import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MessageContent({ text }: { text: string }) {
	return <div className="message-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
		a: ({ href, children }) => {
			const safe = typeof href === "string" && /^https?:\/\//i.test(href);
			return safe ? <a href={href} target="_blank" rel="noreferrer" onClick={event => { if (window.phaseoDesktop?.workspace) { event.preventDefault(); void window.phaseoDesktop.workspace.openLink(href).catch(() => {}); } }}>{children}</a> : <span>{children}</span>;
		},
		img: ({ alt }) => <span>{alt || "Image"}</span>,
	}}>{text}</ReactMarkdown></div>;
}
