"use client";

import { useMemo, useState } from "react";
import { Check, Plus, TagIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatTag, ChatThread } from "@/lib/indexeddb/chats";
import { cn } from "@/lib/utils";

const TAG_COLORS = [
	"#52525b",
	"#64748b",
	"#2563eb",
	"#4f46e5",
	"#7c3aed",
	"#9333ea",
	"#c026d3",
	"#db2777",
	"#be123c",
	"#059669",
	"#16a34a",
	"#65a30d",
	"#0891b2",
	"#0284c7",
	"#d97706",
	"#ea580c",
	"#dc2626",
	"#991b1b",
];

function makeTagId(name: string) {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || `tag-${Date.now()}`;
}

type ChatTagsDialogProps = {
	open: boolean;
	thread: ChatThread | null;
	threads?: ChatThread[];
	availableTags: ChatTag[];
	onOpenChange: (open: boolean) => void;
	onSave: (tags: ChatTag[]) => void;
};

function getCommonTags(threads: ChatThread[]) {
	if (threads.length === 0) return [];
	const [firstThread, ...remainingThreads] = threads;
	return (firstThread.tags ?? []).filter((tag) =>
		remainingThreads.every((thread) =>
			(thread.tags ?? []).some((entry) => entry.id === tag.id),
		),
	);
}

export function ChatTagsDialog({
	open,
	thread,
	threads,
	availableTags,
	onOpenChange,
	onSave,
}: ChatTagsDialogProps) {
	const targets = useMemo(
		() => (threads && threads.length > 0 ? threads : thread ? [thread] : []),
		[thread, threads],
	);
	const [selectedTags, setSelectedTags] = useState<ChatTag[]>(
		() => getCommonTags(targets),
	);
	const [name, setName] = useState("");
	const [color, setColor] = useState(TAG_COLORS[0]);
	const multiple = targets.length > 1;

	const selectedTagIds = useMemo(
		() => new Set(selectedTags.map((tag) => tag.id)),
		[selectedTags],
	);
	const normalizedName = name.trim().replace(/\s+/g, " ");
	const matchingExistingTag = normalizedName
		? availableTags.find(
				(tag) => tag.name.toLowerCase() === normalizedName.toLowerCase(),
			)
		: null;
	const canAddTag = normalizedName.length > 0;
	const createButtonLabel = matchingExistingTag ? "Add tag" : "Create tag";

	const addTag = () => {
		if (!normalizedName) return;
		const nextTag =
			matchingExistingTag ??
			{ id: makeTagId(normalizedName), name: normalizedName, color };
		setSelectedTags((prev) => {
			if (prev.some((tag) => tag.id === nextTag.id)) return prev;
			return [...prev, nextTag];
		});
		setName("");
	};

	const toggleTag = (tag: ChatTag) => {
		setSelectedTags((prev) => {
			if (prev.some((entry) => entry.id === tag.id)) {
				return prev.filter((entry) => entry.id !== tag.id);
			}
			return [...prev, tag];
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg gap-5 p-5">
				<DialogHeader>
					<DialogTitle>Chat Tags</DialogTitle>
					{multiple ? (
						<DialogDescription>
							Apply tags to {targets.length} selected chats.
						</DialogDescription>
					) : null}
				</DialogHeader>
				<div className="grid gap-4">
					{availableTags.length > 0 ? (
						<div className="grid gap-2">
							<div className="flex items-center justify-between gap-3">
								<Label>Choose existing tags</Label>
								<span className="text-xs text-muted-foreground">
									{selectedTags.length} selected
								</span>
							</div>
							<ScrollArea
								className="max-h-36 rounded-xl border border-border bg-muted/20"
								viewportClassName="flex flex-wrap gap-2 p-2"
							>
								{availableTags.map((tag) => {
									const selected = selectedTagIds.has(tag.id);
									return (
										<button
											key={tag.id}
											type="button"
											className={cn(
												"inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
												selected
													? "border-foreground bg-foreground text-background"
													: "border-border bg-background hover:bg-muted",
											)}
											onClick={() => toggleTag(tag)}
										>
											<span
												className="h-2.5 w-2.5 rounded-full"
												style={{ backgroundColor: tag.color }}
											/>
											{tag.name}
											{selected ? <Check className="h-3 w-3" /> : null}
										</button>
									);
								})}
							</ScrollArea>
						</div>
					) : null}
					<div className="grid gap-2">
						<div className="flex items-center justify-between gap-3">
							<Label htmlFor="chat-tag-name">Create a tag</Label>
							{matchingExistingTag ? (
								<span className="text-xs text-muted-foreground">
									Matches existing tag
								</span>
							) : null}
						</div>
						<div className="relative min-w-0">
							<TagIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								id="chat-tag-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										addTag();
									}
								}}
								placeholder="Research, billing, ideas..."
								className="pl-9"
							/>
						</div>
						{matchingExistingTag ? null : (
							<div className="grid gap-1.5">
								<span className="text-xs text-muted-foreground">Color</span>
								<div className="grid grid-cols-9 gap-1.5 rounded-xl border border-border bg-muted/20 p-2">
									{TAG_COLORS.map((option) => (
										<button
											key={option}
											type="button"
											className={cn(
												"size-6 rounded-full border border-border ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
												option === color &&
													"ring-2 ring-foreground ring-offset-2",
											)}
											style={{ backgroundColor: option }}
											onClick={() => setColor(option)}
											aria-label={`Use tag color ${option}`}
											aria-pressed={option === color}
										/>
									))}
								</div>
							</div>
						)}
						<div>
							<Button
								type="button"
								className="w-full"
								onClick={addTag}
								disabled={!canAddTag}
							>
								<Plus className="h-4 w-4" />
								{createButtonLabel}
							</Button>
						</div>
					</div>
					<div className="grid gap-2">
						<Label>Assigned tags</Label>
						{selectedTags.length > 0 ? (
							<div className="flex flex-wrap gap-2">
								{selectedTags.map((tag) => (
									<span
										key={tag.id}
										className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-1 text-xs"
									>
										<span
											className="h-2.5 w-2.5 rounded-full"
											style={{ backgroundColor: tag.color }}
										/>
										{tag.name}
										<button
											type="button"
											className="text-muted-foreground hover:text-foreground"
											onClick={() =>
												setSelectedTags((prev) =>
													prev.filter((entry) => entry.id !== tag.id),
												)
											}
											aria-label={`Remove ${tag.name}`}
										>
											<X className="h-3 w-3" />
										</button>
									</span>
								))}
							</div>
						) : (
							<p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
								No tags assigned.
							</p>
						)}
					</div>
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button type="button" onClick={() => onSave(selectedTags)}>
						Save Tags
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
