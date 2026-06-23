"use client";

import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ChatTag, ChatThread } from "@/lib/indexeddb/chats";
import { Check, Plus, X } from "lucide-react";

const TAG_COLORS = [
	"#111827",
	"#2563eb",
	"#059669",
	"#d97706",
	"#dc2626",
	"#7c3aed",
	"#0891b2",
	"#be123c",
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
	availableTags: ChatTag[];
	onOpenChange: (open: boolean) => void;
	onSave: (tags: ChatTag[]) => void;
};

export function ChatTagsDialog({
	open,
	thread,
	availableTags,
	onOpenChange,
	onSave,
}: ChatTagsDialogProps) {
	const [tags, setTags] = useState<ChatTag[]>(() => thread?.tags ?? []);
	const [name, setName] = useState("");
	const [color, setColor] = useState(TAG_COLORS[0]);

	const addTag = () => {
		const normalizedName = name.trim().replace(/\s+/g, " ");
		if (!normalizedName) return;
		const existing = availableTags.find(
			(tag) => tag.name.toLowerCase() === normalizedName.toLowerCase(),
		);
		const nextTag = existing ?? { id: makeTagId(normalizedName), name: normalizedName, color };
		setTags((prev) => {
			if (
				prev.some(
					(tag) => tag.name.toLowerCase() === nextTag.name.toLowerCase(),
				)
			) {
				return prev;
			}
			return [...prev, nextTag];
		});
		setName("");
	};

	const toggleExistingTag = (tag: ChatTag) => {
		setTags((prev) => {
			if (prev.some((entry) => entry.id === tag.id)) {
				return prev.filter((entry) => entry.id !== tag.id);
			}
			return [...prev, tag];
		});
	};

	const removeTag = (tagId: string) => {
		setTags((prev) => prev.filter((tag) => tag.id !== tagId));
	};

	const selectedTagIds = new Set(tags.map((tag) => tag.id));

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Chat tags</DialogTitle>
				</DialogHeader>
				<div className="grid gap-4">
					{availableTags.length > 0 ? (
						<div className="grid gap-2">
							<Label>Existing tags</Label>
							<div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/20 p-2">
								{availableTags.map((tag) => {
									const selected = selectedTagIds.has(tag.id);
									return (
										<button
											key={tag.id}
											type="button"
											className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-xs transition-colors hover:bg-muted data-[selected=true]:border-foreground data-[selected=true]:bg-foreground data-[selected=true]:text-background"
											data-selected={selected}
											onClick={() => toggleExistingTag(tag)}
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
							</div>
						</div>
					) : null}
					<div className="grid gap-2">
						<Label htmlFor="chat-tag-name">
							{availableTags.length > 0 ? "Create another tag" : "New tag"}
						</Label>
						<div className="flex gap-2">
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
								placeholder="e.g. Research"
							/>
							<div className="flex items-center gap-1 rounded-md border border-border px-1">
								{TAG_COLORS.map((option) => (
									<button
										key={option}
										type="button"
										className="h-6 w-6 rounded-full border border-border ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
										style={{
											backgroundColor: option,
											boxShadow:
												option === color
													? "0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--foreground))"
													: undefined,
										}}
										onClick={() => setColor(option)}
										aria-label={`Use tag color ${option}`}
									/>
								))}
							</div>
							<Button type="button" size="icon" onClick={addTag}>
								<Plus className="h-4 w-4" />
							</Button>
						</div>
					</div>
					<div className="grid gap-2">
						<Label>Assigned tags</Label>
						{tags.length > 0 ? (
							<div className="flex flex-wrap gap-2">
								{tags.map((tag) => (
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
											onClick={() => removeTag(tag.id)}
											aria-label={`Remove ${tag.name}`}
										>
											<X className="h-3 w-3" />
										</button>
									</span>
								))}
							</div>
						) : (
							<p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
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
					<Button type="button" onClick={() => onSave(tags)}>
						Save tags
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
