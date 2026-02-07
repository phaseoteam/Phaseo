"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
	BarChart2,
	ChevronDown,
	Globe,
	Lock,
	MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { updateAppAction } from "@/app/(dashboard)/settings/apps/actions";
import EditAppDialog from "./EditAppDialog";
import MergeAppDialog from "./MergeAppDialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";

type AppItem = {
	id: string;
	title: string;
	app_key: string;
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

export default function AppsPanel({ apps }: { apps: AppItem[] }) {
	const [items, setItems] = useState<AppItem[]>(apps);
	const [pending, setPending] = useState<Record<string, boolean>>({});
	const [openAttribution, setOpenAttribution] = useState<
		Record<string, boolean>
	>({});
	const [editAppId, setEditAppId] = useState<string | null>(null);
	const [mergeAppId, setMergeAppId] = useState<string | null>(null);

	useEffect(() => {
		setItems(apps);
		setPending({});
		setOpenAttribution({});
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
		value: boolean,
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

	if (!sortedApps.length) {
		return (
			<div className="rounded-xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
				No apps found for this team yet.
			</div>
		);
	}

	return (
		<div className="grid gap-4 md:grid-cols-2">
			{sortedApps.map((app) => {
				const isBusy = pending[app.id];
				const imageLetter = app.title?.trim()?.[0]?.toUpperCase() ?? "A";
				const displayUrl = app.url && app.url !== "about:blank";
				const attributionUrl = displayUrl
					? app.url
					: "https://your-app.example";
				const headerBlock = `x-title: ${app.title}\nhttp-referer: ${attributionUrl}`;
				const attributionOpen = Boolean(openAttribution[app.id]);
				const canMerge = sortedApps.length > 1;

				return (
					<div
						key={app.id}
						className="rounded-2xl border border-border/60 bg-white/80 p-5 shadow-sm dark:bg-zinc-950"
					>
						<div className="flex flex-wrap items-start justify-between gap-6">
							<div className="flex min-w-0 items-start gap-4">
								<div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/40">
									{app.image_url ? (
										<img
											src={app.image_url}
											alt={app.title}
											className="h-full w-full object-cover"
										/>
									) : (
										<div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
											{imageLetter}
										</div>
									)}
								</div>
								<div className="min-w-0 space-y-3">
									<div className="flex flex-wrap items-center gap-2">
										<h3 className="text-base font-semibold">
											{displayUrl ? (
												<Link
													href={app.url ?? "#"}
													target="_blank"
													rel="noreferrer"
													className="hover:underline"
												>
													{app.title}
												</Link>
											) : (
												app.title
											)}
										</h3>
									</div>
									<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
										<span>Last seen: {formatDate(app.last_seen)}</span>
										<span>Created: {formatDate(app.created_at)}</span>
									</div>
									{!displayUrl ? (
										<p className="text-xs text-muted-foreground">
											No public URL set
										</p>
									) : null}
								</div>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								<Button
									asChild
									size="sm"
									variant="outline"
									className="h-7 px-2 text-xs"
								>
									<Link
										href={`/apps/${encodeURIComponent(app.id)}`}
										className="inline-flex items-center gap-1"
									>
										<BarChart2 className="h-3 w-3" />
										Stats
									</Link>
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="h-7 px-2 text-xs"
									disabled={isBusy}
									onClick={() =>
										handleToggle(app, "is_public", !app.is_public)
									}
								>
									{app.is_public ? (
										<Globe className="mr-1 h-3 w-3" />
									) : (
										<Lock className="mr-1 h-3 w-3" />
									)}
									{app.is_public ? "Public" : "Private"}
								</Button>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="outline"
											size="sm"
											className="h-7 px-2 text-xs"
										>
											<MoreHorizontal className="h-3 w-3" />
											Manage
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem
											onSelect={(event) => {
												event.preventDefault();
												setEditAppId(app.id);
											}}
										>
											Edit
										</DropdownMenuItem>
										<DropdownMenuItem
											disabled={!canMerge}
											onSelect={(event) => {
												event.preventDefault();
												if (!canMerge) return;
												setMergeAppId(app.id);
											}}
										>
											Merge
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
								<EditAppDialog
									app={app}
									disabled={isBusy}
									onUpdated={(updates) => updateLocal(app.id, updates)}
									open={editAppId === app.id}
									onOpenChange={(open) =>
										setEditAppId(open ? app.id : null)
									}
									hideTrigger
								/>
								<MergeAppDialog
									app={app}
									apps={sortedApps}
									disabled={isBusy}
									onMerged={() => removeLocal(app.id)}
									open={mergeAppId === app.id}
									onOpenChange={(open) =>
										setMergeAppId(open ? app.id : null)
									}
									hideTrigger
								/>
							</div>
						</div>
						<Collapsible
							open={attributionOpen}
							onOpenChange={(open) =>
								setOpenAttribution((prev) => ({
									...prev,
									[app.id]: open,
								}))
							}
							className="mt-4"
						>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<CollapsibleTrigger asChild>
									<Button
										variant="ghost"
										size="sm"
										className="gap-2 text-xs text-muted-foreground"
									>
										Request attribution headers
										<ChevronDown
											className={`h-4 w-4 transition-transform ${
												attributionOpen ? "rotate-180" : ""
											}`}
										/>
									</Button>
								</CollapsibleTrigger>
							</div>
							<CollapsibleContent>
								<div className="mt-3 rounded-xl border border-border/60 bg-muted/30 p-4">
									<div className="flex flex-wrap items-center justify-between gap-3">
										<p className="text-xs text-muted-foreground">
											Include these headers to attribute requests to this app.
										</p>
										<div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs font-mono">
											<span className="text-muted-foreground">
												Copy headers
											</span>
											<CopyButton
												content={headerBlock}
												size="sm"
												variant="outline"
												aria-label="Copy attribution headers"
											/>
										</div>
									</div>
									<div className="mt-3 space-y-1 text-xs">
										<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/80 px-3 py-2 font-mono">
											<span>x-title: {app.title}</span>
											<CopyButton
												content={`x-title: ${app.title}`}
												size="sm"
												variant="ghost"
												aria-label="Copy x-title header"
											/>
										</div>
										<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/80 px-3 py-2 font-mono">
											<span>http-referer: {attributionUrl}</span>
											<CopyButton
												content={`http-referer: ${attributionUrl}`}
												size="sm"
												variant="ghost"
												aria-label="Copy http-referer header"
											/>
										</div>
									</div>
								</div>
							</CollapsibleContent>
						</Collapsible>
					</div>
				);
			})}
		</div>
	);
}
