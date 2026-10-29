import { useMemo, useState, type ReactNode } from "react";
import { Check, Plus, Tag, X } from "lucide-react";
import { tagHue, tagLimits, tagsInUse } from "../../shared/tags";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { useWorkspace } from "../app/workspace";
import { cn } from "../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import { DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "./ui/dropdown-menu";

const tagColour = (tag: string) => `oklch(0.7 0.14 ${tagHue(tag)})`;

export function TagDot({ tag, className }: { tag: string; className?: string }) {
	return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", className)} style={{ background: tagColour(tag) }} />;
}

export function TagChip({ tag, onRemove, active, onClick, className }: { tag: string; onRemove?: () => void; active?: boolean; onClick?: () => void; className?: string }) {
	const body = <><TagDot tag={tag} /><span className="truncate">{tag}</span></>;
	const base = cn("inline-flex h-6 max-w-40 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11.5px] font-medium transition-colors", active ? "border-foreground/25 bg-foreground/10 text-foreground" : "border-border text-muted-foreground", className);
	if (onClick) return <button type="button" aria-pressed={active} onClick={onClick} className={cn(base, "hover:border-foreground/25 hover:text-foreground")}>{body}</button>;
	return <span className={cn(base, onRemove && "pr-1")}>{body}{onRemove && <button type="button" aria-label={`Remove tag ${tag}`} onClick={onRemove} className="grid size-4 place-items-center rounded-full hover:bg-muted hover:text-foreground"><X className="size-3" /></button>}</span>;
}

/** Up to three dots for a sidebar row, with the full list on hover. */
export function TagDots({ tags }: { tags?: string[] }) {
	if (!tags?.length) return null;
	return <span title={tags.join(", ")} className="flex shrink-0 items-center gap-0.5">{tags.slice(0, 3).map(tag => <TagDot key={tag} tag={tag} />)}</span>;
}

function useTagging(task: Pick<TaskOverview, "id" | "tags">) {
	const { overview, command } = useWorkspace();
	const known = useMemo(() => tagsInUse(overview.tasks), [overview.tasks]);
	const tags = task.tags ?? [];
	const has = (tag: string) => tags.some(value => value.toLowerCase() === tag.toLowerCase());
	const save = (next: string[]) => void command({ type: "update-task", id: task.id, tags: next });
	const toggle = (tag: string) => save(has(tag) ? tags.filter(value => value.toLowerCase() !== tag.toLowerCase()) : [...tags, tag]);
	return { known, tags, has, save, toggle };
}

/** The tag field: type to filter, Enter adds what was typed. */
function TagInput({ onAdd, query, setQuery, full }: { onAdd: (tag: string) => void; query: string; setQuery: (value: string) => void; full: boolean }) {
	return <input autoFocus aria-label="Add or find a tag" placeholder={full ? `Up to ${tagLimits.perChat} tags` : "Add or find a tag…"} maxLength={tagLimits.length} value={query} disabled={full}
		onChange={event => setQuery(event.target.value)}
		onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter" && query.trim()) { event.preventDefault(); onAdd(query.trim()); setQuery(""); } }}
		className="h-8 w-full rounded-md bg-transparent px-2 text-[13px] outline-none placeholder:text-muted-foreground/70 disabled:opacity-60" />;
}

/** Tags in the chat header: the chat's tags as removable chips, then a button to add more. */
export function TagEditor({ task, trigger }: { task: Pick<TaskOverview, "id" | "tags">; trigger?: ReactNode }) {
	const { known, tags, has, save, toggle } = useTagging(task);
	const [query, setQuery] = useState("");
	const needle = query.trim().toLowerCase();
	const options = known.filter(tag => !needle || tag.toLowerCase().includes(needle)).slice(0, 30);
	const exact = known.some(tag => tag.toLowerCase() === needle);
	const full = tags.length >= tagLimits.perChat;
	return <div className="flex min-w-0 items-center gap-1">
		{tags.map(tag => <TagChip key={tag} tag={tag} onRemove={() => toggle(tag)} />)}
		<Popover onOpenChange={open => { if (!open) setQuery(""); }}>
			<PopoverTrigger render={<button type="button" aria-label="Tags" title="Tags" className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-1.5 text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground", !tags.length && "border border-dashed border-border px-2")} />}>
				{trigger ?? (tags.length ? <Plus className="size-3.5" /> : <><Tag className="size-3" />Add tag</>)}
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 gap-0 p-1">
				<TagInput query={query} setQuery={setQuery} full={full} onAdd={tag => { if (!has(tag)) save([...tags, tag]); }} />
				<div className="my-1 h-px bg-border" />
				<ScrollArea className="max-h-64" viewportClassName="max-h-64"><div className="flex flex-col">
					{needle && !exact && !full && <button type="button" onClick={() => { save([...tags, query.trim()]); setQuery(""); }} className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-muted"><Plus className="size-3.5 text-muted-foreground" />Create “{query.trim()}”</button>}
					{options.map(tag => <button key={tag} type="button" disabled={full && !has(tag)} onClick={() => toggle(tag)} className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-muted disabled:opacity-50">
						<TagDot tag={tag} className="size-2" /><span className="min-w-0 flex-1 truncate">{tag}</span>{has(tag) && <Check className="size-3.5" />}
					</button>)}
					{!options.length && !needle && <p className="px-2 py-1.5 text-xs text-muted-foreground">Type a tag and press Enter.</p>}
				</div></ScrollArea>
			</PopoverContent>
		</Popover>
	</div>;
}

/** "Tags" in a chat's row menu: the tags in use as checkboxes, plus a field for a new one. */
export function TagMenu({ task }: { task: Pick<TaskOverview, "id" | "tags"> }) {
	const { known, tags, has, save, toggle } = useTagging(task);
	const [query, setQuery] = useState("");
	const needle = query.trim().toLowerCase();
	const full = tags.length >= tagLimits.perChat;
	return <DropdownMenuSub>
		<DropdownMenuSubTrigger><Tag />Tags{tags.length > 0 && <span className="ml-auto pl-3 text-xs text-muted-foreground">{tags.length}</span>}</DropdownMenuSubTrigger>
		<DropdownMenuSubContent className="w-56">
			<TagInput query={query} setQuery={setQuery} full={full} onAdd={tag => { if (!has(tag)) save([...tags, tag]); }} />
			{known.length > 0 && <DropdownMenuSeparator />}
			{known.filter(tag => !needle || tag.toLowerCase().includes(needle)).slice(0, 20).map(tag => <DropdownMenuCheckboxItem key={tag} checked={has(tag)} disabled={full && !has(tag)} closeOnClick={false} onCheckedChange={() => toggle(tag)}>
				<TagDot tag={tag} className="size-2" /><span className="truncate">{tag}</span>
			</DropdownMenuCheckboxItem>)}
		</DropdownMenuSubContent>
	</DropdownMenuSub>;
}
