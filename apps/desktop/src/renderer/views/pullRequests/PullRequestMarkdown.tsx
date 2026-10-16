import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Pencil } from "lucide-react";
import { MessageContent } from "../../components/MessageContent";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { cn } from "../../lib/utils";
import { Tip } from "./presentation";
import { segmentedGroup, segmentedItem } from "./segmented";

/** Markdown from a pull request: `#123` and commit SHAs link into its repository, GitHub video uploads play inline. */
export function PullRequestMarkdown({ text, projectId, repository, className }: { text: string; projectId: string; repository: string; className?: string }) {
	return <div className={cn("pr-comment-body min-w-0 text-xs", className)}><MessageContent text={text} projectId={projectId} repository={repository} /></div>;
}

const COLLAPSED_HEIGHT = 240;
/** T3's PullRequestCommentBody: a long report folds to 240px with "Show full comment". */
export function PullRequestCommentBody(props: ComponentProps<typeof PullRequestMarkdown>) {
	const [expanded, setExpanded] = useState(false), [overflowing, setOverflowing] = useState(false);
	const content = useRef<HTMLDivElement>(null), id = useId();
	useEffect(() => {
		const element = content.current;
		if (!element) return;
		const measure = () => setOverflowing(element.getBoundingClientRect().height > COLLAPSED_HEIGHT);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return <div className="min-w-0">
		<div id={id} className={cn("relative", !expanded && "max-h-[240px] overflow-hidden")} onFocusCapture={() => setExpanded(true)}>
			<div ref={content}><PullRequestMarkdown {...props} /></div>
			{overflowing && !expanded && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent" />}
		</div>
		{overflowing && <Button size="xs" variant="ghost" className="mt-1 -ml-2 text-muted-foreground" aria-expanded={expanded} aria-controls={id} onClick={() => { if (expanded) content.current?.parentElement?.scrollIntoView({ block: "nearest" }); setExpanded(!expanded); }}>{expanded ? "Show less" : "Show full comment"}</Button>}
	</div>;
}

/** Edit affordances reveal on hover or focus, and stay visible on touch screens. */
export function EditButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
	return <span className={cn("flex shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 motion-reduce:transition-none", className)}>
		<Tip label={label}><Button size="icon-xs" variant="ghost" className="text-muted-foreground" aria-label={label} onClick={onClick}><Pencil aria-hidden className="size-3" /></Button></Tip>
	</span>;
}

/** T3's PullRequestMarkdownEditor: Write and Preview, Save on Ctrl or Cmd+Enter, Escape cancels. */
export function MarkdownEditor({ value, label, placeholder, saving, allowEmpty = false, projectId, repository, onSave, onCancel }: { value: string; label: string; placeholder?: string; saving: boolean; allowEmpty?: boolean; projectId: string; repository: string; onSave: (next: string) => void; onCancel: () => void }) {
	const [draft, setDraft] = useState(value), [preview, setPreview] = useState(false);
	const empty = !draft.trim(), disabled = saving || (empty && !allowEmpty);
	return <div className="space-y-2" onKeyDown={event => {
		if (event.nativeEvent.isComposing) return;
		if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) { event.preventDefault(); event.stopPropagation(); if (!disabled && !event.repeat) onSave(draft); return; }
		if (event.key === "Escape" && !saving) { event.preventDefault(); event.stopPropagation(); onCancel(); }
	}}>
		<ToggleGroup aria-label="Markdown editor mode" value={preview ? "preview" : "write"} disabled={saving} onValueChange={(next: string) => { if (next === "write" || next === "preview") setPreview(next === "preview"); }} spacing={0.5} className={segmentedGroup}>
			<ToggleGroupItem value="write" className={segmentedItem}>Write</ToggleGroupItem>
			<ToggleGroupItem value="preview" className={segmentedItem}>Preview</ToggleGroupItem>
		</ToggleGroup>
		{preview ? <div className="border-l-2 border-border/60 py-1 pl-3">{empty ? <p className="text-xs text-muted-foreground">Nothing to preview.</p> : <PullRequestMarkdown text={draft} projectId={projectId} repository={repository} />}</div>
			: <Textarea autoFocus disabled={saving} value={draft} rows={6} placeholder={placeholder} aria-label={label} className="min-h-24 text-xs" onChange={event => setDraft(event.target.value)} />}
		<div className="flex justify-end gap-2">
			<Button size="xs" variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button>
			<Button size="xs" variant="outline" disabled={disabled} onClick={() => onSave(draft)}>{saving ? "Saving…" : "Save"}</Button>
		</div>
	</div>;
}
