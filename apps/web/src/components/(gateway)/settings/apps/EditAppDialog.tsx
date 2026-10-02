"use client";

import { settingsStringKey } from "@/i18n/settings-string-keys";

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
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";
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

function formatCategorySummary(
	categories: AppCategory[],
	emptyLabel: string,
	translate: (category: AppCategory) => string,
) {
	if (categories.length === 0) return emptyLabel;
	return categories.map(translate).join(", ");
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
	const t = useTranslations("SettingsUI");
	const s = (key: string) => t(settingsStringKey(key) as never);
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
					throw new Error(payload.error ?? s("Unable to update app"));
				}
			})();
			toast.promise(updatePromise, {
				loading: s("phraseSavingChanges"),
				success: s("App updated"),
				error: (err) =>
					localizedSettingsError(err, t, "Failed to update app"),
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
							{s("Edit")}
						</Button>
					)}
				</DialogTrigger>
			) : null}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{s("Edit app")}</DialogTitle>
					<DialogDescription>
						{s("phraseUpdateTheMetadataShownOnYourAppProfile")}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSave} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="app-title">{s("App name")}</Label>
						<Input
							id="app-title"
							className="rounded-md"
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Acme Assistant"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="app-url">{s("App URL")}</Label>
						<Input
							id="app-url"
							className="rounded-md"
							value={url}
							onChange={(event) => setUrl(event.target.value)}
							placeholder="https://example.com"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="app-docs-url">{s("Docs URL")}</Label>
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
						<Label htmlFor="app-image">{s("Image URL")}</Label>
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
									{s("Checking image…")}
								</div>
							) : imageValidation === "invalid" ? (
								<div className="flex items-center gap-2 text-xs text-destructive">
									<ImageOff className="size-4" />
									{s("phraseThisURLDidNotLoadAValidImage")}
								</div>
							) : imageValidation === "valid" && validatedImageUrl ? (
								<div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
									<NextImage
										src={validatedImageUrl}
										alt={s("App logo preview")}
										width={32}
										height={32}
										unoptimized
										className="size-8 rounded-lg border border-border/70 bg-muted/40 object-cover"
									/>
									<CheckCircle2 className="size-4" />
									{s("Image loaded")}
								</div>
							) : (
								<p className="text-xs text-muted-foreground">
									{s("phraseLeaveEmptyToUseTheAppInitial")}
								</p>
							)}
						</div>
					</div>
					<div className="space-y-2">
						<div className="flex items-center justify-between gap-3">
							<Label htmlFor="app-category">{s("Categories")}</Label>
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
											{formatCategorySummary(
												categories,
												s("Choose up to 3 categories"),
												(category) => t(`apps.categories.${category}` as never),
											)}
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
												{t(`apps.categories.${option.value}` as never)}
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
							{s("Cancel")}
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
							{loading ? s("phraseSaving") : s("Save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
