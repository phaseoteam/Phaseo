"use client";

import { useId, useState, type FormEvent } from "react";
import { Columns3, Layers, List, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createWorkView, deleteWorkView, updateWorkView } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { parseLayout, sortViews } from "@/lib/work/views";
import type { WorkView, WorkViewFilters, WorkViewLayout } from "@/lib/work/types";
import { useWorkAction } from "./useWorkAction";

/** The "Views" section beside the inbox: shared views, then the reader's own. */
export function ViewsSidebar({ views, userId, activeViewId }: { views: WorkView[]; userId: string | null; activeViewId: string | null }) {
	const t = useTranslations("Work.views");
	const { shared, mine } = sortViews(views, userId);
	return (
		<nav aria-label={t("title")} className="space-y-3 text-sm">
			<h2 className="flex items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground"><Layers className="size-3.5" aria-hidden="true" />{t("title")}</h2>
			<ViewGroup title={t("shared")} views={shared} activeViewId={activeViewId} />
			<ViewGroup title={t("mine")} views={mine} activeViewId={activeViewId} />
			{views.length ? null : <p className="px-2 text-xs text-muted-foreground">{t("empty")}</p>}
		</nav>
	);
}

function ViewGroup({ title, views, activeViewId }: { title: string; views: WorkView[]; activeViewId: string | null }) {
	if (!views.length) return null;
	return (
		<div className="space-y-0.5">
			<p className="px-2 text-[11px] text-muted-foreground">{title}</p>
			<ul className="space-y-0.5">
				{views.map((view) => <ViewRow key={view.id} view={view} active={view.id === activeViewId} />)}
			</ul>
		</div>
	);
}

function ViewRow({ view, active }: { view: WorkView; active: boolean }) {
	const t = useTranslations("Work.views");
	const tCommon = useTranslations("Work.common");
	const router = useRouter();
	const { perform, busy } = useWorkAction();
	const [renaming, setRenaming] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const LayoutIcon = view.layout === "board" ? Columns3 : List;
	return (
		<li className={cn("group flex items-center gap-1 rounded-md pr-1", active ? "bg-muted" : "hover:bg-muted/60")}>
			<Link href={`/work?view=${encodeURIComponent(view.id)}`} aria-current={active ? "page" : undefined} className={cn("flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1", active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
				<LayoutIcon className="size-3.5 shrink-0" aria-hidden="true" />
				<span className="truncate">{view.name}</span>
			</Link>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button type="button" variant="ghost" size="icon-xs" aria-label={t("options", { name: view.name })} className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100"><MoreHorizontal aria-hidden="true" /></Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-44 rounded-md">
					<DropdownMenuItem onClick={() => setRenaming(true)}><Pencil aria-hidden="true" />{t("rename")}</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuRadioGroup value={view.layout} onValueChange={(value) => { const layout = parseLayout(value); if (layout !== view.layout) void perform("layout", () => updateWorkView(view.id, { layout })); }}>
						<DropdownMenuRadioItem value="list"><List aria-hidden="true" />{t("layoutList")}</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="board"><Columns3 aria-hidden="true" />{t("layoutBoard")}</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}><Trash2 aria-hidden="true" />{tCommon("delete")}</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{renaming ? <RenameViewDialog view={view} onClose={() => setRenaming(false)} /> : null}
			<Dialog open={deleting} onOpenChange={setDeleting}>
				<DialogContent className="rounded-md sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{t("deleteTitle")}</DialogTitle>
						<DialogDescription>{tCommon("confirmDelete", { name: view.name })}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setDeleting(false)}>{tCommon("cancel")}</Button>
						<Button type="button" variant="destructive" disabled={busy !== null} onClick={async () => {
							const result = await perform("delete", () => deleteWorkView(view.id), { refresh: false });
							if (result.ok) { setDeleting(false); router.push(active ? "/work" : "/work?tab=open"); router.refresh(); }
						}}>{tCommon("delete")}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</li>
	);
}

function RenameViewDialog({ view, onClose }: { view: WorkView; onClose: () => void }) {
	const t = useTranslations("Work.views");
	const tCommon = useTranslations("Work.common");
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [name, setName] = useState(view.name);
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const next = name.trim();
		if (!next || next === view.name) return onClose();
		const result = await perform("rename", () => updateWorkView(view.id, { name: next }));
		if (result.ok) onClose();
	};
	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="rounded-md sm:max-w-md">
				<form onSubmit={submit} className="space-y-4">
					<DialogHeader><DialogTitle>{t("rename")}</DialogTitle></DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor={id}>{t("name")}</Label>
						<Input id={id} autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="rounded-md" />
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
						<Button type="submit" disabled={busy !== null}>{tCommon("save")}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/** Saves the inbox's current filters and layout as a new view, mine or shared. */
export function SaveViewDialog({ open, onOpenChange, filters, layout }: { open: boolean; onOpenChange: (open: boolean) => void; filters: WorkViewFilters; layout: WorkViewLayout }) {
	const t = useTranslations("Work.views");
	const tCommon = useTranslations("Work.common");
	const router = useRouter();
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [name, setName] = useState("");
	const [shared, setShared] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (!name.trim()) return setError(t("nameRequired"));
		setError(null);
		const result = await perform("save-view", () => createWorkView({ name: name.trim(), filters, layout, shared }), { refresh: false });
		if (result.ok) {
			setName(""); setShared(false); onOpenChange(false);
			router.push(`/work?view=${encodeURIComponent(result.view.id)}`);
			router.refresh();
		}
	};
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="rounded-md sm:max-w-md">
				<form onSubmit={submit} className="space-y-4">
					<DialogHeader>
						<DialogTitle>{t("saveTitle")}</DialogTitle>
						<DialogDescription>{t("saveDescription")}</DialogDescription>
					</DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-name`}>{t("name")}</Label>
						<Input id={`${id}-name`} autoFocus maxLength={80} value={name} placeholder={t("namePlaceholder")} onChange={(event) => setName(event.target.value)} className="rounded-md" />
						{error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
					</div>
					<label className="flex items-center gap-2 text-sm">
						<Checkbox checked={shared} onCheckedChange={(checked) => setShared(Boolean(checked))} />
						{t("shareWithWorkspace")}
					</label>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tCommon("cancel")}</Button>
						<Button type="submit" disabled={busy !== null}>{t("save")}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
