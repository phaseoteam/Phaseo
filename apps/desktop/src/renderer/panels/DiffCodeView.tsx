import { useCallback, useMemo, useState, type ReactNode, type Ref } from "react";
import { CodeView, type CodeViewHandle } from "@pierre/diffs/react";
import type { CodeViewDiffItem, CodeViewItem, DiffLineAnnotation, FileDiffContentsLoader, FileDiffMetadata, SelectedLineRange } from "@pierre/diffs";
import { addReviewComment, nextReviewCommentId, rangeLabel, removeReviewComment, useReviewComments } from "../lib/reviewComments";
import { diffExcerpt } from "../lib/diffSurface";
import { DiffComment } from "./DiffComment";

/** The diff stylesheet inside the viewer's shadow root: 32px sticky file headers, quiet hunk separators. */
export const DIFF_VIEW_CSS = `
:host { --code-background: var(--background); --code-foreground: var(--foreground); }
[data-diffs-header] {
	position: sticky !important; top: 0; z-index: 4;
	background-color: var(--code-background) !important; border-bottom-color: transparent !important;
	align-items: center !important; font-family: var(--font-sans) !important; font-size: 12px !important; line-height: 1 !important;
	min-height: 32px !important; padding-block: 6px !important; padding-inline: 8px 12px !important;
}
[data-diffs-header]:hover { box-shadow: inset 3px 0 color-mix(in srgb, var(--code-foreground) 24%, transparent); }
[data-diffs-header] [data-header-content], [data-diffs-header] [data-metadata] { align-items: center !important; line-height: 1 !important; }
[data-diffs-header] :is([data-title], [data-prev-name]) { line-height: 16px !important; }
[data-diffs-header] :is([data-additions-count], [data-deletions-count]) { font-family: var(--font-mono) !important; font-size: 11px !important; font-variant-numeric: tabular-nums; line-height: 1 !important; }
[data-title] { cursor: pointer; transition: color 120ms ease; font-family: var(--font-sans) !important; }
[data-title]:hover { color: color-mix(in srgb, var(--code-foreground) 84%, var(--primary)) !important; }
[data-file-info] { background-color: var(--code-background) !important; border-block-color: transparent !important; color: var(--code-foreground) !important; }
:is([data-separator="line-info"], [data-separator="line-info-basic"]) {
	height: 24px !important; margin-block: 0 !important;
	--diffs-bg-separator: color-mix(in srgb, var(--code-background) 97%, var(--code-foreground));
}
:is([data-separator="line-info"], [data-separator="line-info-basic"]) :is([data-separator-content], [data-expand-button]) {
	color: color-mix(in srgb, var(--code-foreground) 50%, var(--code-background)) !important; font-family: var(--font-sans) !important; font-size: 11px !important; text-decoration: none !important;
}
:is([data-separator="line-info"], [data-separator="line-info-basic"])[data-expand-index] :is([data-separator-content], [data-expand-button]):hover {
	color: var(--code-foreground) !important; background-color: color-mix(in srgb, var(--code-background) 92%, var(--code-foreground)) !important;
}
[data-expand-button]:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
[data-diff], [data-file] { transition: opacity 200ms ease-out; }
@starting-style { [data-diff], [data-file] { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { [data-diff], [data-file] { transition: none; } }
`;

/** Names the expand controls and makes them keyboard-operable, which the viewer leaves to the host. */
function labelExpandButtons(node: HTMLElement) {
	for (const button of node.shadowRoot?.querySelectorAll<HTMLElement>("[data-expand-button]") ?? []) {
		button.tabIndex = 0;
		button.setAttribute("role", "button");
		button.setAttribute("aria-label", button.hasAttribute("data-expand-all-button") ? "Expand all unchanged lines" : `Expand unchanged lines ${button.hasAttribute("data-expand-up") ? "above" : button.hasAttribute("data-expand-down") ? "below" : "around this change"}`);
		button.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); button.click(); } };
	}
}

type Entry = { id: string; kind: "draft" | "comment"; range: SelectedLineRange; rangeLabel: string; text: string };
type Group = { entries: Entry[] };
export type DiffViewFile = { fileDiff: FileDiffMetadata; filePath: string; fileKey: string; fileVersion: number; collapsed: boolean };
export type DiffViewHandle = CodeViewHandle<Group, undefined>;

const sideOf = (range: SelectedLineRange) => (range.endSide ?? range.side) === "deletions" ? "deletions" as const : "additions" as const;
function appendEntry(annotations: DiffLineAnnotation<Group>[], range: SelectedLineRange, entry: Entry) {
	const side = sideOf(range), existing = annotations.find(annotation => annotation.side === side && annotation.lineNumber === range.end);
	if (existing) existing.metadata = { entries: [...existing.metadata.entries, entry] };
	else annotations.push({ side, lineNumber: range.end, metadata: { entries: [entry] } });
	return annotations;
}
function hash(value: string) { let result = 0x811c9dc5; for (let index = 0; index < value.length; index++) { result ^= value.charCodeAt(index); result = Math.imul(result, 0x01000193); } return result >>> 0; }

/**
 * Every changed file in one virtualised, scrolling viewer, with comments on lines.
 * Comments are kept per chat (`commentTarget`) and view (`sectionId`), and the composer sends them as review context.
 */
export function DiffCodeView({ files, viewerRef, className, commentTarget, sectionId, sectionTitle, layout, wrap, theme, loadDiffFiles, renderHeaderPrefix, renderHeaderSuffix }: {
	files: readonly DiffViewFile[]; viewerRef?: Ref<DiffViewHandle>; className?: string;
	commentTarget: string; sectionId: string; sectionTitle: string;
	layout: "unified" | "split"; wrap: boolean; theme: "light" | "dark"; loadDiffFiles?: FileDiffContentsLoader;
	renderHeaderPrefix: (file: DiffViewFile) => ReactNode; renderHeaderSuffix: (file: DiffViewFile) => ReactNode;
}) {
	const comments = useReviewComments(commentTarget);
	const [draft, setDraft] = useState<{ fileKey: string; entry: Entry }>();
	const [draftText, setDraftText] = useState("");
	const byKey = useMemo(() => new Map(files.map(file => [file.fileKey, file])), [files]);
	const items = useMemo<CodeViewDiffItem<Group>[]>(() => files.map(file => {
		const annotations: DiffLineAnnotation<Group>[] = [];
		for (const comment of comments) if (comment.sectionId === sectionId && comment.filePath === file.filePath) appendEntry(annotations, { start: comment.start, end: comment.end, side: comment.side }, { id: comment.id, kind: "comment", range: { start: comment.start, end: comment.end, side: comment.side }, rangeLabel: comment.rangeLabel, text: comment.text });
		if (draft?.fileKey === file.fileKey) appendEntry(annotations, draft.entry.range, draft.entry);
		return { id: file.fileKey, type: "diff", fileDiff: file.fileDiff, annotations, collapsed: file.collapsed, version: hash(`${file.fileVersion}:${file.collapsed ? 1 : 0}:${annotations.flatMap(annotation => annotation.metadata.entries.map(entry => `${entry.id}:${entry.text}`)).join(":")}`) };
	}), [files, comments, sectionId, draft]);

	const begin = useCallback((range: SelectedLineRange | null, context: { item: CodeViewItem<Group> }) => {
		if (!range || context.item.type !== "diff") return;
		setDraftText("");
		setDraft({ fileKey: context.item.id, entry: { id: nextReviewCommentId(), kind: "draft", range, rangeLabel: rangeLabel(range.start, range.end), text: "" } });
	}, []);
	const submit = (text: string) => {
		const file = draft && byKey.get(draft.fileKey);
		if (!draft || !file) return;
		const { range } = draft.entry;
		addReviewComment({ id: draft.entry.id, target: commentTarget, sectionId, sectionTitle, filePath: file.filePath, side: sideOf(range), start: Math.min(range.start, range.end), end: Math.max(range.start, range.end), rangeLabel: draft.entry.rangeLabel, excerpt: diffExcerpt(file.fileDiff, range), fenceLanguage: "diff", text, createdAt: new Date().toISOString() });
		setDraft(undefined); setDraftText("");
	};
	const remove = (entry: Entry) => { if (entry.kind === "draft") { setDraft(undefined); setDraftText(""); } else removeReviewComment(commentTarget, entry.id); };

	const options = useMemo(() => ({
		diffStyle: layout, overflow: wrap ? "wrap" as const : "scroll" as const, theme: { light: "github-light", dark: "github-dark" }, themeType: theme,
		preferredHighlighter: "shiki-js" as const, lineDiffType: "none" as const, hunkSeparators: "line-info" as const, tokenizeMaxLength: 50_000, tokenizeMaxLineLength: 4000,
		stickyHeaders: true, unsafeCSS: DIFF_VIEW_CSS, onPostRender: labelExpandButtons, enableGutterUtility: !draft, enableLineSelection: !draft, onGutterUtilityClick: begin,
		itemMetrics: { diffHeaderHeight: 32, hunkSeparatorHeight: 24, spacing: 0, paddingTop: 0, paddingBottom: 8 }, layout: { paddingTop: 0, paddingBottom: 0, gap: 0 },
		...(loadDiffFiles ? { loadDiffFiles } : {}),
	}), [layout, wrap, theme, draft, begin, loadDiffFiles]);

	return <CodeView<Group>
		ref={viewerRef}
		className={className ? `diff-surface-view outline-none ${className}` : "diff-surface-view outline-none"}
		items={items}
		options={options}
		renderHeaderPrefix={item => { const file = byKey.get(item.id); return file ? renderHeaderPrefix(file) : null; }}
		renderHeaderFilenameSuffix={item => { const file = byKey.get(item.id); return file ? renderHeaderSuffix(file) : null; }}
		renderAnnotation={annotation => {
			const group = (annotation as DiffLineAnnotation<Group>).metadata;
			const hasDraft = group.entries.some(entry => entry.kind === "draft");
			return <div className={hasDraft ? "py-1" : "divide-y divide-border/30 border-y border-border/30"}>{group.entries.map(entry => <DiffComment key={entry.id} kind={entry.kind} rangeLabel={entry.rangeLabel} text={entry.kind === "draft" ? draftText : entry.text}
				onTextChange={setDraftText} onCancel={() => remove(entry)} onComment={submit} onDelete={() => remove(entry)} />)}</div>;
		}}
	/>;
}
