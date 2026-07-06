"use client";

import { useEffect, useState } from "react";
import { BookOpen, ChevronDown, Folder } from "lucide-react";
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
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { updateAppAction } from "@/app/(dashboard)/settings/apps/actions";
import {
	APP_CATEGORY_OPTIONS,
	MAX_APP_CATEGORIES,
	type AppCategory,
	parseAppCategories,
	serializeAppCategories,
} from "@/lib/appCategories";
import { APP_CATEGORY_VISUALS } from "./appCategoryVisuals";

type AppItem = {
	id: string;
	title: string;
	category: string | null;
	docs_url: string | null;
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

function formatCategorySummary(categories: AppCategory[]) {
	if (categories.length === 0) return "Choose up to 3 categories";
	return categories
		.map(
			(category) =>
				APP_CATEGORY_OPTIONS.find((option) => option.value === category)?.label
		)
		.filter(Boolean)
		.join(", ");
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
	const [docsUrl, setDocsUrl] = useState(app.docs_url ?? "");
	const [categories, setCategories] = useState<AppCategory[]>(
		parseAppCategories(app.category)
	);
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
		setDocsUrl(app.docs_url ?? "");
		setCategories(parseAppCategories(app.category));
	}, [open, app]);

	const setCategoryChecked = (category: AppCategory, checked: boolean) => {
		setCategories((current) => {
			if (!checked) {
				return current.filter((value) => value !== category);
			}

			if (current.includes(category)) {
				return current;
			}

			if (current.length >= MAX_APP_CATEGORIES) {
				return current;
			}

			return [...current, category];
		});
	};

	const onSave = async (event: React.FormEvent) => {
		event.preventDefault();
		setLoading(true);

		const normalizedUrl = normalizeUrl(url);
		const normalizedImageUrl = imageUrl.trim();
		const normalizedCategory = serializeAppCategories(categories);
		const normalizedDocsUrl = docsUrl.trim();

		const updates = {
			title,
			url: normalizedUrl,
			docs_url: normalizedDocsUrl.length > 0 ? normalizedDocsUrl : null,
			image_url: normalizedImageUrl.length > 0 ? normalizedImageUrl : null,
			category: normalizedCategory,
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
				docs_url: normalizedDocsUrl.length > 0 ? normalizedDocsUrl : null,
				image_url:
					normalizedImageUrl.length > 0 ? normalizedImageUrl : null,
				category: normalizedCategory,
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
						<Label htmlFor="app-docs-url">Docs URL</Label>
						<div className="relative">
							<BookOpen className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								id="app-docs-url"
								value={docsUrl}
								onChange={(event) => setDocsUrl(event.target.value)}
								placeholder="https://docs.example.com"
								className="pl-9"
							/>
						</div>
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
					<div className="space-y-2">
						<div className="flex items-center justify-between gap-3">
							<Label htmlFor="app-category">Categories</Label>
							<span className="text-xs text-muted-foreground">
								{categories.length}/{MAX_APP_CATEGORIES}
							</span>
						</div>
						<div>
							<DropdownMenu modal={false}>
								<DropdownMenuTrigger asChild>
									<Button
										id="app-category"
										type="button"
										variant="outline"
										className="h-auto min-h-9 w-full justify-between gap-3 rounded-2xl bg-input/50 px-3 py-2 text-left font-normal"
									>
										<span className="flex min-w-0 items-center gap-2">
											<Folder className="size-4 shrink-0 text-muted-foreground" />
											<span className="truncate text-sm">
												{formatCategorySummary(categories)}
											</span>
										</span>
										<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start" className="w-72">
									{APP_CATEGORY_OPTIONS.map((option) => {
										const checked = categories.includes(option.value);
										const disabled =
											!checked && categories.length >= MAX_APP_CATEGORIES;
										const visuals = APP_CATEGORY_VISUALS[option.value];
										const Icon = visuals.Icon;

										return (
											<DropdownMenuCheckboxItem
												key={option.value}
												checked={checked}
												disabled={disabled}
												className="group/category"
												onSelect={(event) => event.preventDefault()}
												onCheckedChange={(nextChecked) => {
													setCategoryChecked(option.value, Boolean(nextChecked));
												}}
											>
												<Icon
													className={`size-4 transition-colors ${visuals.iconClassName}`}
												/>
												{option.label}
											</DropdownMenuCheckboxItem>
										);
									})}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
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
