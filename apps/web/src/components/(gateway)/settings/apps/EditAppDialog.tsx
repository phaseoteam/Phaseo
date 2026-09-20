"use client";

import { useEffect, useState } from "react";
import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";
import NextImage from "next/image";
import { BookOpen, CheckCircle2, ChevronDown, Folder, ImageOff, LoaderCircle } from "lucide-react";
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

type ImageValidationState = "empty" | "validating" | "valid" | "invalid";

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
	const invalidateSettings = useInvalidatePrivateSettings();
	const [internalOpen, setInternalOpen] = useState(false);
	const [title, setTitle] = useState(app.title);
	const [url, setUrl] = useState(app.url && app.url !== "about:blank" ? app.url : "");
	const [imageUrl, setImageUrl] = useState(app.image_url ?? "");
	const [imageValidation, setImageValidation] = useState<ImageValidationState>(
		app.image_url ? "validating" : "empty"
	);
	const [validatedImageUrl, setValidatedImageUrl] = useState<string | null>(null);
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
		setImageValidation(app.image_url ? "validating" : "empty");
		setValidatedImageUrl(null);
		setDocsUrl(app.docs_url ?? "");
		setCategories(parseAppCategories(app.category));
	}, [open, app]);

	useEffect(() => {
		if (!open) return;
		const candidate = imageUrl.trim();
		if (!candidate) {
			setImageValidation("empty");
			setValidatedImageUrl(null);
			return;
		}

		let parsed: URL;
		try {
			parsed = new URL(candidate);
			if (!["http:", "https:"].includes(parsed.protocol)) {
				setImageValidation("invalid");
				setValidatedImageUrl(null);
				return;
			}
		} catch {
			setImageValidation("invalid");
			setValidatedImageUrl(null);
			return;
		}

		let active = true;
		const image = new Image();
		setImageValidation("validating");
		setValidatedImageUrl(null);
		image.onload = () => {
			if (active) {
				setValidatedImageUrl(parsed.href);
				setImageValidation("valid");
			}
		};
		image.onerror = () => {
			if (active) {
				setValidatedImageUrl(null);
				setImageValidation("invalid");
			}
		};
		image.src = parsed.href;

		return () => {
			active = false;
			image.onload = null;
			image.onerror = null;
		};
	}, [imageUrl, open]);

	const updateImageUrl = (value: string) => {
		setImageUrl(value);
		setValidatedImageUrl(null);
		setImageValidation(value.trim() ? "validating" : "empty");
	};

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
		if (imageValidation === "validating" || imageValidation === "invalid") {
			return;
		}
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
			const updatePromise = (async () => {
				const response = await fetch(
					`/api/settings/apps/${encodeURIComponent(app.id)}`,
					{
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(updates),
					},
				);
				if (!response.ok) {
					const payload = await response.json().catch(() => ({})) as { error?: string };
					throw new Error(payload.error ?? "Unable to update app");
				}
			})();
			toast.promise(updatePromise, {
				loading: "Saving changes...",
				success: "App updated",
				error: (err) => err?.message ?? "Failed to update app",
			});
			await updatePromise;
			void invalidateSettings();
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
						<Button
							variant="outline"
							size="sm"
							className="rounded-md"
							disabled={disabled}
						>
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
							className="rounded-md"
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Acme Assistant"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="app-url">App URL</Label>
						<Input
							id="app-url"
							className="rounded-md"
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
								className="rounded-md pl-9"
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="app-image">Image URL</Label>
						<Input
							id="app-image"
							className="rounded-md"
							value={imageUrl}
							onChange={(event) => updateImageUrl(event.target.value)}
							placeholder="https://example.com/logo.png"
							aria-invalid={imageValidation === "invalid"}
						/>
						<div className="min-h-9" aria-live="polite">
							{imageValidation === "validating" ? (
								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									<LoaderCircle className="size-4 animate-spin" />
									Checking image…
								</div>
							) : imageValidation === "invalid" ? (
								<div className="flex items-center gap-2 text-xs text-destructive">
									<ImageOff className="size-4" />
									This URL did not load a valid image.
								</div>
							) : imageValidation === "valid" && validatedImageUrl ? (
								<div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
									<NextImage
										src={validatedImageUrl}
										alt="App logo preview"
										width={32}
										height={32}
										unoptimized
										className="size-8 rounded-lg border border-border/70 bg-muted/40 object-cover"
									/>
									<CheckCircle2 className="size-4" />
									Image loaded
								</div>
							) : (
								<p className="text-xs text-muted-foreground">
									Leave empty to use the app initial.
								</p>
							)}
						</div>
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
								<DropdownMenuTrigger render={<Button
										id="app-category"
										type="button"
										variant="outline"
										className="h-auto min-h-9 w-full justify-between gap-3 rounded-md bg-input/50 px-3 py-2 text-left font-normal" />}>

										<span className="flex min-w-0 items-center gap-2">
											<Folder className="size-4 shrink-0 text-muted-foreground" />
											<span className="truncate text-sm">
												{formatCategorySummary(categories)}
											</span>
										</span>
										<ChevronDown className="size-4 shrink-0 text-muted-foreground" />

								</DropdownMenuTrigger>
								<DropdownMenuContent align="start" className="w-72 rounded-md">
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
												closeOnClick={false}
												className="group/category rounded-md"
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
						<Button
							type="button"
							variant="ghost"
							className="rounded-md"
							onClick={() => setOpen(false)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							className="rounded-md"
							disabled={
								loading ||
								imageValidation === "validating" ||
								imageValidation === "invalid"
							}
						>
							{loading ? "Saving..." : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
