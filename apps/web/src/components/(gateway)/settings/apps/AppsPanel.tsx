"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
	BarChart2,
	Blocks,
	Copy,
	Globe,
	Lock,
	Merge,
	MoreHorizontal,
	Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
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
	is_managed: boolean;
	is_public: boolean;
	last_seen: string | null;
	created_at: string | null;
};

function getAttributionHeaders(app: AppItem) {
	const displayUrl = app.url && app.url !== "about:blank";
	const attributionUrl = displayUrl ? app.url : "https://your-app.example";
	return `x-title: ${app.title}\nhttp-referer: ${attributionUrl}`;
}

function AppAvatar({ app }: { app: AppItem }) {
	const imageLetter = app.title?.trim()?.[0]?.toUpperCase() ?? "A";
	const [imageFailed, setImageFailed] = useState(false);
	const isPhaseoChat = app.app_key === "phaseo-chat";

	useEffect(() => {
		setImageFailed(false);
	}, [app.image_url]);

	return (
		<div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border border-border/70 bg-muted/40">
			{isPhaseoChat ? (
				<>
					<Image
						src="/logo_light.svg"
						alt="Phaseo"
						width={24}
						height={24}
						className="size-6 object-contain dark:hidden"
					/>
					<Image
						src="/logo_dark.svg"
						alt="Phaseo"
						width={24}
						height={24}
						className="hidden size-6 object-contain dark:block"
					/>
				</>
			) : app.image_url && !imageFailed ? (
				<img
					src={app.image_url}
					alt={app.title}
					className="size-full object-cover"
					onError={() => setImageFailed(true)}
				/>
			) : (
				<span className="text-xs font-semibold text-muted-foreground">
					{imageLetter}
				</span>
			)}
		</div>
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
			className={`h-5 rounded-md px-1.5 text-[11px] font-medium ${visuals.badgeClassName}`}
		>
			<Icon className="size-3" />
			{label}
		</Badge>
	);
}

function CategoryBadges({ category }: { category: string | null }) {
	const categories = parseAppCategories(category);

	if (categories.length === 0) return null;

	return (
		<div className="mt-1 flex flex-wrap gap-1">
			{categories.map((category) => (
				<CategoryBadge key={category} category={category} />
			))}
		</div>
	);
}

function CategoryIcons({ category }: { category: string | null }) {
	const categories = parseAppCategories(category);
	if (categories.length === 0) return null;

	return (
		<div className="flex shrink-0 items-center gap-0.5">
			{categories.map((category) => {
				const { Icon, iconClassName } = APP_CATEGORY_VISUALS[category];
				const label = getAppCategoryLabel(category) ?? category;
				return (
					<Tooltip key={category}>
						<TooltipTrigger asChild>
							<span
								className="inline-flex size-5 items-center justify-center rounded-md hover:bg-muted/60"
								aria-label={label}
							>
								<Icon className={`size-3.5 ${iconClassName}`} />
							</span>
						</TooltipTrigger>
						<TooltipContent>{label}</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);
}

export default function AppsPanel({ apps }: { apps: AppItem[] }) {
	const format = useDisplayFormatters();
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

	const handleVisibilityToggle = async (app: AppItem, value: boolean) => {
		setBusy(app.id, true);
		try {
			const updatePromise = (async () => {
				const response = await fetch(
					`/api/settings/apps/${encodeURIComponent(app.id)}`,
					{
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ is_public: value }),
					},
				);
				if (!response.ok) {
					const payload = await response.json().catch(() => ({})) as { error?: string };
					throw new Error(payload.error ?? "Unable to update app");
				}
			})();
			toast.promise(updatePromise, {
				loading: "Updating app...",
				success: "App updated",
				error: (err) => err?.message ?? "Failed to update app",
			});
			await updatePromise;
			updateLocal(app.id, { is_public: value });
		} finally {
			setBusy(app.id, false);
		}
	};

	const renderActions = (app: AppItem, mobile = false) => {
		const canMerge =
			!app.is_managed && sortedApps.filter((item) => !item.is_managed).length > 1;
		const isBusy = pending[app.id];
		const attributionHeaders = getAttributionHeaders(app);

		return (
			<DropdownMenu>
				<Tooltip>
					<TooltipTrigger render={<DropdownMenuTrigger render={<Button
						variant="ghost"
						size="icon-sm"
						className={mobile ? "size-10 rounded-md" : "rounded-md"}
						aria-label={`Manage ${app.title}`} />} />}>
						<MoreHorizontal className="size-4" />
					</TooltipTrigger>
					<TooltipContent>More actions</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="end" className="w-44 rounded-md">
					{mobile ? (
						<>
							<DropdownMenuItem
								className="rounded-md"
								render={
									<Link href={`/apps/${encodeURIComponent(app.id)}`} />
								}
							>
								<BarChart2 className="mr-2 size-4" />
								View Stats
							</DropdownMenuItem>
							{!app.is_managed ? (
								<DropdownMenuItem
									className="rounded-md"
									disabled={isBusy}
									onClick={() =>
										handleVisibilityToggle(app, !app.is_public)
									}
								>
									{app.is_public ? (
										<Lock className="mr-2 size-4" />
									) : (
										<Globe className="mr-2 size-4" />
									)}
									{app.is_public ? "Make Private" : "Make Public"}
								</DropdownMenuItem>
							) : null}
						</>
					) : null}
					<DropdownMenuItem
						className="rounded-md"
						onClick={() => {
							navigator.clipboard
								.writeText(attributionHeaders)
								.then(() => toast.success("Attribution headers copied"))
								.catch(() => toast.error("Failed to copy headers"));
						}}
					>
						<Copy className="mr-2 size-4" />
						Copy Headers
					</DropdownMenuItem>
					{!app.is_managed ? (
						<DropdownMenuItem
							className="rounded-md"
							onClick={() => setEditAppId(app.id)}
						>
							<Pencil className="mr-2 size-4" />
							Edit
						</DropdownMenuItem>
					) : null}
					{!app.is_managed ? (
						<DropdownMenuItem
							className="rounded-md"
							disabled={!canMerge}
							onClick={() => {
								if (!canMerge) return;
								setMergeAppId(app.id);
							}}
						>
							<Merge className="mr-2 size-4" />
							Merge
						</DropdownMenuItem>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	if (!sortedApps.length) {
		return (
			<Empty className="rounded-md border border-dashed border-border/80 p-8">
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
		<TooltipProvider delayDuration={150}>
			<div className="lg:overflow-hidden lg:rounded-md lg:border lg:border-border/60 lg:bg-card">
				<ScrollArea
					className="hidden w-full lg:block"
					viewportClassName="pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					scrollBarOrientation="horizontal"
					keepScrollbarMounted
				>
					<Table
						wrapInContainer={false}
						className="min-w-[720px] table-fixed text-sm [&_tr:last-child]:border-b-0 [&_td]:px-4 [&_th]:px-4"
					>
						<TableHeader className="bg-muted/30">
							<TableRow>
								<TableHead className="w-[42%]">App</TableHead>
								<TableHead className="w-[16%]">Visibility</TableHead>
								<TableHead className="w-[16%]">Last Seen</TableHead>
								<TableHead className="w-[16%]">Created</TableHead>
								<TableHead className="w-[10%] text-right" />
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
													<div className="flex min-w-0 items-center gap-1">
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
														<CategoryIcons category={app.category} />
													</div>
													<div className="truncate text-xs text-muted-foreground">
														{displayUrl ? app.url : "No public URL set"}
													</div>
										</div>
									</div>
								</TableCell>
								<TableCell>
									{app.is_managed ? (
										<Badge variant="outline" className="rounded-md">
											Managed by Phaseo
										</Badge>
									) : (
										<Button
											type="button"
											size="xs"
											variant="outline"
											className="rounded-md"
											disabled={isBusy}
											onClick={() =>
												handleVisibilityToggle(app, !app.is_public)
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
									)}
								</TableCell>
								<TableCell className="text-xs text-muted-foreground">
									{format.date(app.last_seen)}
								</TableCell>
								<TableCell className="text-xs text-muted-foreground">
									{format.date(app.created_at)}
								</TableCell>
								<TableCell className="text-right">
									<div className="flex items-center justify-end gap-1">
										<Tooltip>
											<TooltipTrigger asChild>
												<Button asChild size="icon-sm" variant="ghost" className="rounded-md">
													<Link href={`/apps/${encodeURIComponent(app.id)}`} aria-label={`View stats for ${app.title}`}>
														<BarChart2 className="size-4" />
													</Link>
												</Button>
											</TooltipTrigger>
							<TooltipContent>View Stats</TooltipContent>
										</Tooltip>
										{renderActions(app)}
									</div>
								</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</ScrollArea>

				<div className="space-y-3 lg:hidden">
					{sortedApps.map((app) => {
						const displayUrl = app.url && app.url !== "about:blank";

						return (
							<div
								key={app.id}
								className="space-y-3 rounded-md border border-border/60 bg-card p-3"
							>
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
										</div>
									</div>
									{renderActions(app, true)}
								</div>
								<CategoryBadges category={app.category} />

								<div className="grid grid-cols-2 gap-3 text-xs">
									<div>
										<div className="text-muted-foreground">Last Seen</div>
										<div>{format.date(app.last_seen)}</div>
									</div>
									<div>
										<div className="text-muted-foreground">Created</div>
										<div>{format.date(app.created_at)}</div>
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
		</TooltipProvider>
	);
}
