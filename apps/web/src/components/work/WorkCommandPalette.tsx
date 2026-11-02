"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Bell, Columns3, FolderKanban, Inbox, IterationCw, Layers, List, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { findWorkItems, listWorkMembers, listWorkViews } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { useRouter } from "@/i18n/navigation";
import { isPaletteShortcut, searchPalette, type PaletteEntry } from "@/lib/work/palette";
import type { WorkItem, WorkMember, WorkView } from "@/lib/work/types";
import { CreateItemDialog } from "./CreateItemDialog";
import { StateIcon, useWorkCopy } from "./WorkBits";

const PAGES = [
	{ id: "page:inbox", href: "/work", key: "inbox", icon: Inbox },
	{ id: "page:notifications", href: "/work/inbox", key: "notifications", icon: Bell },
	{ id: "page:projects", href: "/work/projects", key: "projects", icon: FolderKanban },
	{ id: "page:cycles", href: "/work/cycles", key: "cycles", icon: IterationCw },
	{ id: "page:insights", href: "/work/insights", key: "insights", icon: BarChart3 },
] as const;

/** Ctrl/Cmd K on work pages: jump to an item, create one, switch views or go to a page. */
export function WorkCommandPalette() {
	const t = useTranslations("Work.palette");
	const copy = useWorkCopy();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [items, setItems] = useState<WorkItem[]>([]);
	const [views, setViews] = useState<WorkView[] | null>(null);
	const [members, setMembers] = useState<WorkMember[] | null>(null);
	const [creating, setCreating] = useState(false);
	const [mac, setMac] = useState(false);

	useEffect(() => { setMac(/mac|iphone|ipad/i.test(navigator.userAgent)); }, []);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (!isPaletteShortcut(event)) return;
			event.preventDefault();
			setOpen((current) => !current);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// Views load once, the first time the palette opens.
	useEffect(() => {
		if (!open || views !== null) return;
		let cancelled = false;
		void listWorkViews().then((result) => { if (!cancelled) setViews(result.ok ? result.views ?? [] : []); }).catch(() => { if (!cancelled) setViews([]); });
		return () => { cancelled = true; };
	}, [open, views]);

	// Items are searched on the server after a short pause in typing.
	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		const timer = window.setTimeout(async () => {
			const result = await findWorkItems(query).catch(() => null);
			if (!cancelled) setItems(result?.ok ? result.items ?? [] : []);
		}, 150);
		return () => { cancelled = true; window.clearTimeout(timer); };
	}, [open, query]);

	const entries = useMemo<PaletteEntry[]>(() => [
		{ id: "action:create", group: "actions", label: t("createItem"), keywords: [t("createKeywords")] },
		...PAGES.map((page) => ({ id: page.id, group: "pages" as const, label: t(`pages.${page.key}`), keywords: [t("goTo")] })),
		...(views ?? []).map((view) => ({ id: `view:${view.id}`, group: "views" as const, label: view.name, keywords: [t("viewKeyword")] })),
		...items.map((item) => ({ id: `item:${item.number}`, group: "items" as const, label: item.title, number: item.number, keywords: [`#${item.number}`, ...item.labels] })),
	], [items, t, views]);
	const results = useMemo(() => searchPalette(entries, query), [entries, query]);

	const run = (entry: PaletteEntry) => {
		setOpen(false);
		setQuery("");
		if (entry.id === "action:create") {
			setCreating(true);
			if (members === null) void listWorkMembers().then((result) => setMembers(result.ok ? result.members ?? [] : [])).catch(() => setMembers([]));
			return;
		}
		if (entry.id.startsWith("page:")) return router.push(PAGES.find((page) => page.id === entry.id)?.href ?? "/work");
		if (entry.id.startsWith("view:")) return router.push(`/work?view=${encodeURIComponent(entry.id.slice(5))}`);
		if (entry.id.startsWith("item:")) return router.push(`/work/${entry.id.slice(5)}`);
	};

	const groups = (["items", "actions", "views", "pages"] as const).map((group) => ({ group, entries: results.filter((entry) => entry.group === group) })).filter(({ entries }) => entries.length);
	const itemByNumber = new Map(items.map((item) => [item.number, item]));

	return (
		<>
			<Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setOpen(true)} aria-label={t("open")}>
				<Search aria-hidden="true" />
				<span className="hidden md:inline">{t("trigger")}</span>
				<Kbd className="hidden rounded-md md:inline-flex">{mac ? "⌘K" : "Ctrl K"}</Kbd>
			</Button>
			<CommandDialog
				open={open}
				onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}
				title={t("title")}
				description={t("description")}
				className="rounded-md! sm:max-w-xl"
				commandProps={{ shouldFilter: false, className: "rounded-md" }}
			>
				<CommandInput value={query} onValueChange={setQuery} placeholder={t("placeholder")} />
				<CommandList>
					<CommandEmpty>{t("empty")}</CommandEmpty>
					{groups.map(({ group, entries: groupEntries }) => (
						<CommandGroup key={group} heading={t(`groups.${group}`)}>
							{groupEntries.map((entry) => {
								const item = entry.number ? itemByNumber.get(entry.number) : undefined;
								const page = PAGES.find((candidate) => candidate.id === entry.id);
								const view = entry.id.startsWith("view:") ? views?.find((candidate) => `view:${candidate.id}` === entry.id) : undefined;
								const Icon = page?.icon ?? (entry.id === "action:create" ? Plus : view ? (view.layout === "board" ? Columns3 : List) : Layers);
								return (
									<CommandItem key={entry.id} value={entry.id} onSelect={() => run(entry)}>
										{item ? <StateIcon state={item.state} label={copy.state(item.state)} /> : <Icon aria-hidden="true" />}
										{item ? <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">#{item.number}</span> : null}
										<span className="min-w-0 flex-1 truncate">{entry.label}</span>
									</CommandItem>
								);
							})}
						</CommandGroup>
					))}
				</CommandList>
			</CommandDialog>
			<CreateItemDialog open={creating} onOpenChange={setCreating} members={members ?? []} />
		</>
	);
}
