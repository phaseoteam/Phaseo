"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
	BarChart2,
	Blocks,
	Copy,
	Globe,
	Lock,
	Merge,
	MoreHorizontal,
	Pencil,
	Power,
	PowerOff,
} from "lucide-react";
import { toast } from "sonner";
import { updateAppAction } from "@/app/(dashboard)/settings/apps/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	type AppCategory,
	getAppCategoryLabel,
	parseAppCategories,
} from "@/lib/appCategories";
import { APP_CATEGORY_VISUALS } from "./appCategoryVisuals";
import EditAppDialog from "./EditAppDialog";
import MergeAppDialog from "./MergeAppDialog";

type AppItem = {
	id: string;
	title: string;
	app_key: string;
	category: string | null;
	docs_url: string | null;
	url: string | null;
	image_url: string | null;
	is_public: boolean;
	is_active: boolean;
	last_seen: string | null;
	created_at: string | null;
};

function formatDate(value: string | null) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleDateString();
}

function getAttributionHeaders(app: AppItem) {
	const displayUrl = app.url && app.url !== "about:blank";
	const attributionUrl = displayUrl ? app.url : "https://your-app.example";
	return `x-title: ${app.title}\nhttp-referer: ${attributionUrl}`;
}

function AppAvatar({ app }: { app: AppItem }) {
	const imageLetter = app.title?.trim()?.[0]?.toUpperCase() ?? "A";

	return (
		<div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/70 bg-muted/40">
			{app.image_url ? (
				<img
					src={app.image_url}
					alt={app.title}
					className="size-full object-cover"
				/>
			) : (
				<span className="text-xs font-semibold text-muted-foreground">
					{imageLetter}
				</span>
			)}
		</div>
	);
}

function StatusBadge({ active }: { active: boolean }) {
	return (
		<Badge
			variant="outline"
			className={
				active
					? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
					: "border-border bg-muted/50 text-muted-foreground"
			}
		>
			{active ? "Active" : "Inactive"}
		</Badge>
	);
}

function CategoryBadge({ category }: { category: AppCategory }) {
	const label = getAppCategoryLabel(category);

	if (!label) return null;

	const visuals = APP_CATEGORY_VISUALS[category];
	const Icon = visuals.Icon;

	return (
		<Badge
			variant="outline"
			className={`h-5 rounded-lg px-1.5 text-[11px] font-medium ${visuals.badgeClassName}`}
		>
			<Icon className="size-3" />
			{label}
		</Badge>
	);
}

function CategoryBadges({ category }: { category: string | null }) {
	const categories = parseAppCategories(category);

	if (categories.length === 0) {
		return (
			<span className="text-xs text-muted-foreground">No category set</span>
		);
	}

	return (
		<div className="flex flex-wrap gap-1">
			{categories.map((category) => (
				<CategoryBadge key={category} category={category} />
			))}
		</div>
	);
}

export default function AppsPanel({ apps }: { apps: AppItem[] }) {
	const [items, setItems] = useState<AppItem[]>(apps);
	const [pending, setPending] = useState<Record<string, boolean>>({});
	const [editAppId, setEditAppId] = useState<string | null>(null);
	const [mergeAppId, setMergeAppId] = useState<string | null>(null);

	useEffect(() => {
		setItems(apps);
		setPending({});
		setEditAppId(null);
		setMergeAppId(null);
	}, [apps]);

	const sortedApps = useMemo(() => {
		return [...items].sort((a, b) => {
			const aTime = a.last_seen ? new Date(a.last_seen).getTime() : 0;
			const bTime = b.last_seen ? new Date(b.last_seen).getTime() : 0;
			return bTime - aTime;
		});
	}, [items]);

	const editApp = sortedApps.find((app) => app.id === editAppId) ?? null;
	const mergeApp = sortedApps.find((app) => app.id === mergeAppId) ?? null;

	const setBusy = (id: string, value: boolean) => {
		setPending((prev) => ({ ...prev, [id]: value }));
	};

	const updateLocal = (id: string, updates: Partial<AppItem>) => {
		setItems((prev) =>
			prev.map((app) => (app.id === id ? { ...app, ...updates } : app))
		);
	};

	const removeLocal = (id: string) => {
		setItems((prev) => prev.filter((app) => app.id !== id));
		setEditAppId((prev) => (prev === id ? null : prev));
		setMergeAppId((prev) => (prev === id ? null : prev));
	};

	const handleToggle = async (
		app: AppItem,
		field: "is_public" | "is_active",
		value: boolean
	) => {
		setBusy(app.id, true);
		try {
			await toast.promise(updateAppAction(app.id, { [field]: value }), {
				loading: "Updating app...",
				success: "App updated",
				error: (err) => err?.message ?? "Failed to update app",
			});
			updateLocal(app.id, { [field]: value });
		} finally {
			setBusy(app.id, false);
		}
	};

	const renderActions = (app: AppItem) => {
		const isBusy = pending[app.id];
		const canMerge = sortedApps.length > 1;
		const attributionHeaders = getAttributionHeaders(app);

		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={`Manage ${app.title}`}
					>
						<MoreHorizontal className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuItem
						onClick={() => {
							navigator.clipboard
								.writeText(attributionHeaders)
								.then(() => toast.success("Attribution headers copied"))
								.catch(() => toast.error("Failed to copy headers"));
						}}
					>
						<Copy className="mr-2 size-4" />
						Copy headers
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => setEditAppId(app.id)}>
						<Pencil className="mr-2 size-4" />
						Edit
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={!canMerge}
						onClick={() => {
							if (!canMerge) return;
							setMergeAppId(app.id);
						}}
					>
						<Merge className="mr-2 size-4" />
						Merge
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={isBusy}
						onClick={() => {
							handleToggle(app, "is_active", !app.is_active);
						}}
					>
						{app.is_active ? (
							<PowerOff className="mr-2 size-4" />
						) : (
							<Power className="mr-2 size-4" />
						)}
						{app.is_active ? "Disable" : "Enable"}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	if (!sortedApps.length) {
		return (
			<Empty className="rounded-xl border border-dashed border-border/80 p-8">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Blocks className="h-5 w-5" />
					</EmptyMedia>
					<EmptyTitle>No apps found</EmptyTitle>
					<EmptyDescription>
						App attribution records will appear here after your requests include
						app headers.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<>
			<div className="overflow-hidden rounded-lg border border-border/60 bg-card">
				<div className="hidden lg:block">
					<Table className="min-w-[820px] table-fixed text-sm [&_tr:last-child]:border-b-0 [&_td]:px-4 [&_th]:px-4">
						<TableHeader className="bg-muted/30">
							<TableRow>
								<TableHead className="w-[38%]">App</TableHead>
								<TableHead className="w-[12%]">Status</TableHead>
								<TableHead className="w-[14%]">Visibility</TableHead>
								<TableHead className="w-[14%]">Last Seen</TableHead>
								<TableHead className="w-[14%]">Created</TableHead>
								<TableHead className="w-[8%] text-right" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{sortedApps.map((app) => {
								const displayUrl = app.url && app.url !== "about:blank";
								const isBusy = pending[app.id];

								return (
									<TableRow key={app.id}>
										<TableCell className="py-3">
											<div className="flex min-w-0 items-center gap-3">
												<AppAvatar app={app} />
												<div className="min-w-0">
													<div className="truncate font-medium">
														{displayUrl ? (
															<Link
																href={app.url ?? "#"}
																target="_blank"
																rel="noreferrer"
																className="underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current"
															>
																{app.title}
															</Link>
														) : (
															app.title
														)}
													</div>
													<div className="truncate text-xs text-muted-foreground">
														{displayUrl ? app.url : "No public URL set"}
													</div>
													<div className="mt-1">
														<CategoryBadges category={app.category} />
													</div>
												</div>
											</div>
										</TableCell>
										<TableCell>
											<StatusBadge active={app.is_active} />
										</TableCell>
										<TableCell>
											<Button
												type="button"
												size="xs"
												variant="outline"
												disabled={isBusy}
												onClick={() =>
													handleToggle(app, "is_public", !app.is_public)
												}
												aria-label={`Make ${app.title} ${
													app.is_public ? "private" : "public"
												}`}
											>
												{app.is_public ? (
													<Globe className="size-3" />
												) : (
													<Lock className="size-3" />
												)}
												{app.is_public ? "Public" : "Private"}
											</Button>
										</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{formatDate(app.last_seen)}
										</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{formatDate(app.created_at)}
										</TableCell>
										<TableCell className="text-right">
											<div className="flex items-center justify-end gap-1">
												<Button
													asChild
													size="icon-sm"
													variant="ghost"
													aria-label={`View stats for ${app.title}`}
												>
													<Link href={`/apps/${encodeURIComponent(app.id)}`}>
														<BarChart2 className="size-4" />
													</Link>
												</Button>
												{renderActions(app)}
											</div>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>

				<div className="divide-y divide-border/60 lg:hidden">
					{sortedApps.map((app) => {
						const displayUrl = app.url && app.url !== "about:blank";
						const isBusy = pending[app.id];

						return (
							<div key={app.id} className="space-y-3 p-3">
								<div className="flex items-start justify-between gap-3">
									<div className="flex min-w-0 items-center gap-3">
										<AppAvatar app={app} />
										<div className="min-w-0">
											<div className="truncate font-medium">
												{displayUrl ? (
													<Link
														href={app.url ?? "#"}
														target="_blank"
														rel="noreferrer"
														className="underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current"
													>
														{app.title}
													</Link>
												) : (
													app.title
												)}
											</div>
											<div className="truncate text-xs text-muted-foreground">
												{displayUrl ? app.url : "No public URL set"}
											</div>
											<div className="mt-1">
												<CategoryBadges category={app.category} />
											</div>
										</div>
									</div>
									{renderActions(app)}
								</div>

								<div className="flex flex-wrap items-center gap-2">
									<StatusBadge active={app.is_active} />
									<Button
										type="button"
										size="xs"
										variant="outline"
										disabled={isBusy}
										onClick={() =>
											handleToggle(app, "is_public", !app.is_public)
										}
										aria-label={`Make ${app.title} ${
											app.is_public ? "private" : "public"
										}`}
									>
										{app.is_public ? (
											<Globe className="size-3" />
										) : (
											<Lock className="size-3" />
										)}
										{app.is_public ? "Public" : "Private"}
									</Button>
									<Button
										asChild
										size="xs"
										variant="outline"
										aria-label={`View stats for ${app.title}`}
									>
										<Link href={`/apps/${encodeURIComponent(app.id)}`}>
											<BarChart2 className="size-3" />
											Stats
										</Link>
									</Button>
								</div>

								<div className="grid grid-cols-2 gap-3 text-xs">
									<div>
										<div className="text-muted-foreground">Last Seen</div>
										<div>{formatDate(app.last_seen)}</div>
									</div>
									<div>
										<div className="text-muted-foreground">Created</div>
										<div>{formatDate(app.created_at)}</div>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{editApp ? (
				<EditAppDialog
					app={editApp}
					disabled={pending[editApp.id]}
					onUpdated={(updates) => updateLocal(editApp.id, updates)}
					open
					onOpenChange={(open) => {
						if (!open) setEditAppId(null);
					}}
					hideTrigger
				/>
			) : null}
			{mergeApp ? (
				<MergeAppDialog
					app={mergeApp}
					apps={sortedApps}
					disabled={pending[mergeApp.id]}
					onMerged={() => removeLocal(mergeApp.id)}
					open
					onOpenChange={(open) => {
						if (!open) setMergeAppId(null);
					}}
					hideTrigger
				/>
			) : null}
		</>
	);
}
