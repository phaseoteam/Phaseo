"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { updateAppAction } from "@/app/(dashboard)/settings/apps/actions";

type AppItem = {
	id: string;
	title: string;
	url: string | null;
	image_url: string | null;
};

type EditAppDialogProps = {
	app: AppItem;
	disabled?: boolean;
	onUpdated: (updates: Partial<AppItem>) => void;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	hideTrigger?: boolean;
	trigger?: React.ReactNode;
};

function normalizeUrl(value: string) {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : "about:blank";
}

export default function EditAppDialog({
	app,
	disabled,
	onUpdated,
	open: openProp,
	onOpenChange,
	hideTrigger,
	trigger,
}: EditAppDialogProps) {
	const [internalOpen, setInternalOpen] = useState(false);
	const [title, setTitle] = useState(app.title);
	const [url, setUrl] = useState(app.url && app.url !== "about:blank" ? app.url : "");
	const [imageUrl, setImageUrl] = useState(app.image_url ?? "");
	const [loading, setLoading] = useState(false);
	const isControlled = typeof openProp === "boolean";
	const open = isControlled ? openProp : internalOpen;
	const setOpen = (next: boolean) => {
		if (isControlled) {
			onOpenChange?.(next);
		} else {
			setInternalOpen(next);
		}
	};

	useEffect(() => {
		if (!open) return;
		setTitle(app.title);
		setUrl(app.url && app.url !== "about:blank" ? app.url : "");
		setImageUrl(app.image_url ?? "");
	}, [open, app]);

	const onSave = async (event: React.FormEvent) => {
		event.preventDefault();
		setLoading(true);

		const normalizedUrl = normalizeUrl(url);
		const normalizedImageUrl = imageUrl.trim();

		const updates = {
			title,
			url: normalizedUrl,
			image_url: normalizedImageUrl.length > 0 ? normalizedImageUrl : null,
		};

		try {
			await toast.promise(updateAppAction(app.id, updates), {
				loading: "Saving changes...",
				success: "App updated",
				error: (err) => err?.message ?? "Failed to update app",
			});
			onUpdated({
				title: title.trim(),
				url: normalizedUrl,
				image_url:
					normalizedImageUrl.length > 0 ? normalizedImageUrl : null,
			});
			setOpen(false);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{!hideTrigger ? (
				<DialogTrigger asChild>
					{trigger ?? (
						<Button variant="outline" size="sm" disabled={disabled}>
							Edit
						</Button>
					)}
				</DialogTrigger>
			) : null}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit app</DialogTitle>
					<DialogDescription>
						Update the metadata shown on your app profile.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSave} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="app-title">App name</Label>
						<Input
							id="app-title"
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Acme Assistant"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="app-url">App URL</Label>
						<Input
							id="app-url"
							value={url}
							onChange={(event) => setUrl(event.target.value)}
							placeholder="https://example.com"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="app-image">Image URL</Label>
						<Input
							id="app-image"
							value={imageUrl}
							onChange={(event) => setImageUrl(event.target.value)}
							placeholder="https://example.com/logo.png"
						/>
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={loading}>
							{loading ? "Saving..." : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
