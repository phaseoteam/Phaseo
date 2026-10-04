import { FileDiff } from "@pierre/diffs/react";
import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseDiffFromFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import { CodeBlock } from "./MessageContent";
import { parseReviewPatch } from "./diffRendering";
import { useTextCopy } from "./useTextCopy";
import type { DiffViewProps } from "./DiffView";

export function DiffRenderer({ contents, patch, layout, copyText = patch, hideHeader = false, context, onRefresh }: DiffViewProps) {
	const files = useMemo(() => contents ? [parseDiffFromFile(contents.oldFile, contents.newFile)] : parseReviewPatch(patch), [patch, contents]);
	const [theme, setTheme] = useState<"light" | "dark">(() => document.documentElement.dataset.theme === "dark" ? "dark" : "light");
	const { status, copying, copy } = useTextCopy(copyText);
	const [contextError, setContextError] = useState("");
	const [contextLoading, setContextLoading] = useState(0);
	const active = useRef(true);
	useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
	const loadDiffFiles = useCallback(async (file: FileDiffMetadata) => {
		const api = window.phaseoDesktop?.workspace;
		if (!api || !context) throw new Error("Open a project to expand context.");
		setContextError(""); setContextLoading(value => value + 1);
		try { return await api.gitDiffContents(context.projectId, { filename: file.name, staged: context.staged, hash: context.hash }); }
		catch (reason) { if (active.current) setContextError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); throw reason; }
		finally { if (active.current) setContextLoading(value => value - 1); }
	}, [context]);
	const onPostRender = useCallback((node: HTMLElement) => {
		for (const button of node.shadowRoot?.querySelectorAll<HTMLElement>("[data-expand-button]") ?? []) {
			button.tabIndex = 0;
			button.setAttribute("aria-label", button.hasAttribute("data-expand-all-button") ? "Expand all unchanged lines" : `Expand unchanged lines ${button.hasAttribute("data-expand-up") ? "above" : button.hasAttribute("data-expand-down") ? "below" : "around this change"}`);
			button.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); button.click(); node.closest<HTMLElement>(".review-diff-content")?.focus({ preventScroll: true }); } };
		}
	}, []);
	useEffect(() => {
		const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
		return () => observer.disconnect();
	}, []);
	const options = useMemo(() => ({ diffStyle: layout, theme: { light: "github-light", dark: "github-dark" }, themeType: theme, preferredHighlighter: "shiki-js" as const, overflow: "wrap" as const, disableFileHeader: hideHeader, hunkSeparators: "line-info" as const, tokenizeMaxLength: 50_000, tokenizeMaxLineLength: 4000, lineDiffType: "word" as const, ...(context ? { loadDiffFiles } : {}), onPostRender, unsafeCSS: "[data-diffs-header]{font-family:Montserrat,ui-sans-serif,system-ui,sans-serif;padding:12px 16px;background:var(--surface-muted);color:var(--text)}[data-expand-button]:focus-visible{outline:2px solid var(--ring);outline-offset:2px}" }), [layout, theme, hideHeader, context, loadDiffFiles, onPostRender]);
	const fallback = <CodeBlock text={copyText} language="diff" />;
	if (!files) return fallback;
	return <div className="review-diff" data-layout={layout}>
		<div className="message-code-actions"><span aria-live="polite">{status === "failed" ? "Copy failed" : layout === "split" ? "Before / After" : "Unified diff"}</span><button type="button" onClick={() => void copy()} disabled={copying} aria-label={status === "copied" ? "Copied" : "Copy code"}>{status === "copied" ? <Check size={14} /> : <Copy size={14} />}{status === "copied" ? "Copied" : "Copy code"}</button></div>
		{contextLoading > 0 && <p className="review-diff-feedback" role="status">Loading context…</p>}
		{contextError && <div className="review-diff-feedback"><span role="alert">{contextError}</span>{onRefresh && <button type="button" disabled={contextLoading > 0} onClick={onRefresh}>Refresh review</button>}</div>}
		<div className="review-diff-content" tabIndex={0} aria-label={layout === "split" ? "Side-by-side changes" : "Unified changes"}>{files.map((file, index) => <FileDiff key={`${index}:${file.name}`} fileDiff={file} options={options} />)}</div>
	</div>;
}
