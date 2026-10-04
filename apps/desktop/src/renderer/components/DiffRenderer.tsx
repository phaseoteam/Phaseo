import { FileDiff } from "@pierre/diffs/react";
import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CodeBlock } from "./MessageContent";
import { parseReviewPatch } from "./diffRendering";
import { useTextCopy } from "./useTextCopy";
import type { DiffViewProps } from "./DiffView";

export function DiffRenderer({ patch, layout, copyText = patch, hideHeader = false }: DiffViewProps) {
	const files = useMemo(() => parseReviewPatch(patch), [patch]);
	const [theme, setTheme] = useState<"light" | "dark">(() => document.documentElement.dataset.theme === "dark" ? "dark" : "light");
	const { status, copying, copy } = useTextCopy(copyText);
	useEffect(() => {
		const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
		return () => observer.disconnect();
	}, []);
	const options = useMemo(() => ({ diffStyle: layout, theme: { light: "github-light", dark: "github-dark" }, themeType: theme, preferredHighlighter: "shiki-js" as const, overflow: "wrap" as const, disableFileHeader: hideHeader, hunkSeparators: "line-info" as const, tokenizeMaxLength: 50_000, tokenizeMaxLineLength: 4000, lineDiffType: "word" as const, unsafeCSS: "[data-diffs-header]{font-family:Montserrat,ui-sans-serif,system-ui,sans-serif;padding:12px 16px;background:var(--surface-muted);color:var(--text)}" }), [layout, theme, hideHeader]);
	const fallback = <CodeBlock text={copyText} language="diff" />;
	if (!files) return fallback;
	return <div className="review-diff" data-layout={layout}>
		<div className="message-code-actions"><span aria-live="polite">{status === "failed" ? "Copy failed" : layout === "split" ? "Before / After" : "Unified diff"}</span><button type="button" onClick={() => void copy()} disabled={copying} aria-label={status === "copied" ? "Copied" : "Copy code"}>{status === "copied" ? <Check size={14} /> : <Copy size={14} />}{status === "copied" ? "Copied" : "Copy code"}</button></div>
		<div className="review-diff-content" tabIndex={0} aria-label={layout === "split" ? "Side-by-side changes" : "Unified changes"}>{files.map((file, index) => <FileDiff key={`${index}:${file.name}`} fileDiff={file} options={options} />)}</div>
	</div>;
}
