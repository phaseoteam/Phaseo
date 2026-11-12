import * as React from "react";
import { useTranslations } from "@/i18n/react";
import { toast } from "sonner";
import { CircleCheck, CircleDashed, ClipboardCopy, Clock, Hourglass, Network, PauseCircle, ShieldAlert, ShieldOff, Trash2, Wallet, MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { DisplayDate } from "@/components/display/DisplayValue";
import { cn } from "@/lib/utils";
import { bulkUpdateKeysAction, type BulkKeyActionInput, type BulkKeySelection } from "@/features/settings/security/actions";
import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";
import { keyDetailHref } from "../keys/keyDetailHref";
import {
	KeyStorageLocationList,
	KeyStorageLocationPicker,
	KeyStorageLogo,
	useKeyStorageLocationName,
} from "../keys/KeyStorageLocationPicker";
import type { KeySecurityKey, SettingsKeySecurityInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { SortableTableHead, nextTableSort, type TableSort } from "../../usage/SortableTableHead";
import {
	keySecurityRisks,
	keySecurityStatus,
	matchesKeySecurityFilter,
	sameKeySecurityFilter,
	sortKeySecurityKeys,
	type KeySecurityFilter,
	type KeySecurityRisk,
	type KeySecuritySortKey,
	type KeySecurityStatus,
} from "./keySecurityTable";

const NANOS_PER_USD = 1_000_000_000;
/** The word typed to confirm a bulk revoke. It isn't translated, so it is the same in every language. */
const REVOKE_CONFIRMATION = "revoke";

/** A CSV of keys and their owners, for asking each owner what to do with their key. */
export function keyOwnerCsv(keys: KeySecurityKey[]) {
	const cell = (value: unknown) => {
		const text = value === null || value === undefined ? "" : String(value);
		// Quote every cell, and keep spreadsheet apps from running formulas.
		return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
	};
	const rows = keys.map((key) => [key.name, key.prefix, key.owner_name, key.owner_email, key.last_used_at ?? "never", key.expires_at ?? "never", key.storage_locations.join(" ")]);
	return [["key", "prefix", "owner", "owner_email", "last_used", "expires", "stored_in"], ...rows].map((row) => row.map(cell).join(",")).join("\n");
}

type PendingAction = { action: BulkKeyActionInput["action"]; selection: BulkKeySelection; count: number; label: string };

/** One icon per risk or status, shared by the filters and the table. */
const ICONS: Record<KeySecurityRisk | KeySecurityStatus, typeof Wallet> = {
	safe_to_remove: Trash2,
	no_spend_limit: Wallet,
	never_expires: Hourglass,
	idle: Clock,
	no_ip_allowlist: Network,
	no_storage_location: MapPin,
	paused: PauseCircle,
	never_used: CircleDashed,
	active: CircleCheck,
};
const RISK_FILTERS: KeySecurityRisk[] = ["safe_to_remove", "no_spend_limit", "never_expires", "idle", "no_ip_allowlist", "no_storage_location"];
/** How many storage locations show before "Show all". */
const TOP_LOCATIONS = 5;

// Full class names, so Tailwind finds them. Borders and fills use the sRGB hex of each
// Tailwind 500 colour: Chrome draws the rounded corners of a faint oklch orange-500 or
// violet-500 border with cyan specks on light backgrounds, because those colours sit
// outside sRGB. The hex versions look the same without the specks.
const GREEN = { tag: "border-[#00bc7d]/30 bg-[#00bc7d]/10 text-emerald-700 dark:text-emerald-300", icon: "text-emerald-600 dark:text-emerald-400" };
const BLUE = { tag: "border-[#00a6f4]/30 bg-[#00a6f4]/10 text-sky-700 dark:text-sky-300", icon: "text-sky-600 dark:text-sky-400" };
const VIOLET = { tag: "border-[#8e51ff]/30 bg-[#8e51ff]/10 text-violet-700 dark:text-violet-300", icon: "text-violet-600 dark:text-violet-400" };
const AMBER = { tag: "border-[#fe9a00]/30 bg-[#fe9a00]/10 text-amber-700 dark:text-amber-300", icon: "text-amber-600 dark:text-amber-400" };
const ORANGE = { tag: "border-[#ff6900]/30 bg-[#ff6900]/10 text-orange-700 dark:text-orange-300", icon: "text-orange-600 dark:text-orange-400" };
const ROSE = { tag: "border-[#ff2056]/30 bg-[#ff2056]/10 text-rose-700 dark:text-rose-300", icon: "text-rose-600 dark:text-rose-400" };

/** Green is fine, blue and violet are informational, amber and orange want a look, rose is the most urgent. */
const TONES: Record<KeySecurityRisk | KeySecurityStatus, typeof GREEN> = {
	active: GREEN,
	never_used: BLUE,
	paused: VIOLET,
	idle: AMBER,
	safe_to_remove: ROSE,
	no_spend_limit: ROSE,
	never_expires: AMBER,
	no_ip_allowlist: ORANGE,
	no_storage_location: BLUE,
};

function Tag({ kind, label }: { kind: KeySecurityRisk | KeySecurityStatus; label: string }) {
	const Icon = ICONS[kind];
	return (
		<span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs", TONES[kind].tag)}>
			<Icon aria-hidden="true" className="size-3" />{label}
		</span>
	);
}

function FilterChip({ active, label, count, title, onClick, children }: {
	active: boolean; label: string; count: number; title?: string; onClick: () => void; children?: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			title={title}
			className={cn(
				"inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
				active ? "border-foreground bg-muted text-foreground" : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
			)}
		>
			{children}
			<span>{label}</span>
			<span className="tabular-nums text-muted-foreground">{count}</span>
		</button>
	);
}

export default function KeySecurityClient({ data }: { data: SettingsKeySecurityInitialData }) {
	const t = useTranslations("SettingsUI");
	const nameOf = useKeyStorageLocationName();
	const invalidateSettings = useInvalidatePrivateSettings();
	const [filter, setFilter] = React.useState<KeySecurityFilter>({ kind: "all" });
	const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
	const [pending, setPending] = React.useState<PendingAction | null>(null);
	const [busy, setBusy] = React.useState(false);
	const [confirmText, setConfirmText] = React.useState("");
	const [spendLimitUsd, setSpendLimitUsd] = React.useState("");
	const [expiresOn, setExpiresOn] = React.useState("");
	const [locations, setLocations] = React.useState<string[]>([]);
	const [sort, setSort] = React.useState<TableSort<KeySecuritySortKey>>(null);
	const [allLocations, setAllLocations] = React.useState(false);
	const keysSection = React.useRef<HTMLElement>(null);
	const { summary, canManage, maxBulkKeys } = data;

	const visible = React.useMemo(() => sortKeySecurityKeys(data.keys.filter((key) => matchesKeySecurityFilter(key, filter)), sort), [data.keys, filter, sort]);
	const visibleIds = visible.map((key) => key.id);
	const selectedVisible = visibleIds.filter((id) => selected.has(id));
	const allSelected = visible.length > 0 && selectedVisible.length === visible.length;

	function choose(next: KeySecurityFilter) {
		setFilter((current) => sameKeySecurityFilter(current, next) ? { kind: "all" } : next);
		setSelected(new Set());
	}

	function changeSort(key: KeySecuritySortKey) {
		setSort((current) => nextTableSort(current, key));
	}

	// From a recommendation or location: filter the table and bring it into view.
	function show(next: KeySecurityFilter) {
		setFilter(next);
		setSelected(new Set());
		requestAnimationFrame(() => {
			const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			keysSection.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
		});
	}

	function open(action: PendingAction["action"], keyIds: string[], label: string) {
		if (keyIds.length > maxBulkKeys) { toast.error(t("keySecurity.tooMany", { max: maxBulkKeys })); return; }
		setConfirmText(""); setSpendLimitUsd(""); setExpiresOn(""); setLocations([]);
		setPending({ action, selection: { keyIds }, count: keyIds.length, label });
	}

	// Every live key in a location, including any this page didn't load.
	function openLocation(locationId: string, count: number) {
		setConfirmText("");
		setPending({ action: "revoke", selection: { storageLocation: locationId }, count, label: t("keySecurity.revokeAllIn", { name: nameOf(locationId) }) });
	}

	function input(): BulkKeyActionInput | null {
		if (!pending) return null;
		switch (pending.action) {
			case "pause": case "revoke": return { action: pending.action };
			case "set_monthly_spend_limit": {
				const usd = Number(spendLimitUsd);
				return Number.isFinite(usd) && usd > 0 ? { action: pending.action, monthlyCostNanos: Math.round(usd * NANOS_PER_USD) } : null;
			}
			case "set_expiry": {
				const date = new Date(`${expiresOn}T23:59:59Z`);
				// The server rejects past dates; observedAt keeps render pure.
				return expiresOn && date.getTime() > data.observedAt ? { action: pending.action, expiresAt: date.toISOString() } : null;
			}
			case "set_storage_locations": return { action: pending.action, storageLocations: locations };
		}
	}

	async function run() {
		const request = input();
		if (!pending || !request) return;
		setBusy(true);
		try {
			const result = await bulkUpdateKeysAction({ data: { workspaceId: data.workspaceId, selection: pending.selection, input: request } });
			if (result.ok === false) { toast.error(result.message ?? t("keySecurity.actionFailed")); return; }
			toast.success(t("keySecurity.changed", { count: result.changed.length }));
			setPending(null);
			setSelected(new Set());
			void invalidateSettings();
		} finally {
			setBusy(false);
		}
	}

	async function copyOwners(keys: KeySecurityKey[]) {
		try {
			await navigator.clipboard.writeText(keyOwnerCsv(keys));
			toast.success(t("keySecurity.ownersCopied", { count: keys.length }));
		} catch {
			toast.error(t("keySecurity.copyFailed"));
		}
	}

	// Literal keys keep the plural messages type-checked.
	const recommendTitle = {
		safe_to_remove: (count: number) => t("keySecurity.recommend.safe_to_remove.title", { count }),
		no_spend_limit: (count: number) => t("keySecurity.recommend.no_spend_limit.title", { count }),
		never_expires: (count: number) => t("keySecurity.recommend.never_expires.title", { count }),
		no_storage_location: (count: number) => t("keySecurity.recommend.no_storage_location.title", { count }),
	};
	const statusLabel: Record<KeySecurityStatus, string> = {
		paused: t("keySecurity.paused"),
		safe_to_remove: t("keySecurity.risks.safe_to_remove"),
		idle: t("keySecurity.risks.idle"),
		never_used: t("keySecurity.neverUsed"),
		active: t("keySecurity.status.active"),
	};
	const confirmMessage = {
		pause: (count: number) => t("keySecurity.confirm.pause", { count }),
		revoke: (count: number) => t("keySecurity.confirm.revoke", { count }),
		set_monthly_spend_limit: (count: number) => t("keySecurity.confirm.set_monthly_spend_limit", { count }),
		set_expiry: (count: number) => t("keySecurity.confirm.set_expiry", { count }),
		set_storage_locations: (count: number) => t("keySecurity.confirm.set_storage_locations", { count }),
	};
	const revokeConfirmed = pending?.action !== "revoke" || confirmText.trim().toLowerCase() === REVOKE_CONFIRMATION;
	const ready = Boolean(input()) && revokeConfirmed && !busy;
	const selectedKeys = data.keys.filter((key) => selected.has(key.id));
	const recommendations = [
		{ id: "safe_to_remove" as const, icon: Trash2, count: summary.safe_to_remove, owners: true },
		{ id: "no_spend_limit" as const, icon: Wallet, count: summary.no_spend_limit, owners: false },
		{ id: "never_expires" as const, icon: Hourglass, count: summary.never_expires, owners: true },
		{ id: "no_storage_location" as const, icon: MapPin, count: summary.no_storage_location, owners: true },
	].filter((item) => item.count > 0);

	const notices = data.incidents?.length ? (
		<section className="space-y-3" aria-label={t("keySecurity.incident.label")}>
			{data.incidents.map((incident) => (
				<div key={incident.id} role="alert" className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
					<div className="flex items-center gap-2 font-medium">
						<ShieldAlert className="size-4 text-destructive" />
						<KeyStorageLogo id={incident.location_id} />
						{incident.action === "revoke"
							? t("keySecurity.incident.revoked", { count: incident.keys, name: nameOf(incident.location_id) })
							: t("keySecurity.incident.paused", { count: incident.keys, name: nameOf(incident.location_id) })}
					</div>
					<p className="text-muted-foreground"><DisplayDate value={incident.applied_at} /> · {incident.title}</p>
					<p>{incident.customer_message}</p>
					<p>{incident.action === "revoke" ? t("keySecurity.incident.revokedNext") : t("keySecurity.incident.pausedNext")}</p>
					<div className="flex flex-wrap gap-2 pt-1">
						<Button asChild size="sm" className="rounded-md"><Link href="/settings/keys">{t("keySecurity.incident.replace")}</Link></Button>
						{incident.source_url ? (
							<Button asChild size="sm" variant="outline" className="rounded-md">
								<a href={incident.source_url} target="_blank" rel="noreferrer">{t("keySecurity.incident.source", { name: nameOf(incident.location_id) })}</a>
							</Button>
						) : null}
					</div>
				</div>
			))}
		</section>
	) : null;

	if (summary.total === 0) {
		return (
			<div className="space-y-8">
				{notices}
				<p className="rounded-md border p-6 text-sm text-muted-foreground">{t("keySecurity.empty")}</p>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			{notices}
			{recommendations.length > 0 ? (
				<section className="space-y-3">
					<h2 className="text-base font-semibold">{t("keySecurity.recommendations")}</h2>
					<ul className="divide-y rounded-md border">
						{recommendations.map((item) => {
							const keys = data.keys.filter((key) => matchesKeySecurityFilter(key, { kind: item.id }));
							return (
								<li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
									<div className="flex gap-3">
										<item.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
										<div>
											<div className="text-sm font-medium">{recommendTitle[item.id](item.count)}</div>
											<p className="text-sm text-muted-foreground">{t(`keySecurity.recommend.${item.id}.body` as never)}</p>
										</div>
									</div>
									<div className="flex shrink-0 gap-2">
										<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={() => show({ kind: item.id })}>{t("keySecurity.viewKeys")}</Button>
										{item.owners && canManage ? (
											<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={() => copyOwners(keys)}><ClipboardCopy className="size-4" />{t("keySecurity.copyOwners")}</Button>
										) : null}
									</div>
								</li>
							);
						})}
					</ul>
				</section>
			) : null}

			{summary.locations.length > 0 ? (
				<section className="space-y-3">
					<div>
						<h2 className="text-base font-semibold">{t("keySecurity.storedIn")}</h2>
						<p className="text-sm text-muted-foreground">{t("keySecurity.storedInHelp")}</p>
					</div>
					<ul className="divide-y rounded-md border">
						{(allLocations ? summary.locations : summary.locations.slice(0, TOP_LOCATIONS)).map((location) => {
							return (
								<li key={location.id} className="flex items-center justify-between gap-3 p-3">
									<div className="flex min-w-0 items-center gap-2 text-sm">
										<KeyStorageLogo id={location.id} />
										<span className="truncate font-medium">{nameOf(location.id)}</span>
										<span className="text-muted-foreground">{t("keySecurity.keyCount", { count: location.keys })}</span>
									</div>
									<div className="flex shrink-0 gap-2">
										<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={() => show({ kind: "location", id: location.id })}>{t("keySecurity.viewKeys")}</Button>
										{canManage ? (
											<Button type="button" variant="destructive" size="sm" className="rounded-md" onClick={() => openLocation(location.id, location.keys)}>
												<ShieldOff className="size-4" />{t("keySecurity.revokeAll")}
											</Button>
										) : null}
									</div>
								</li>
							);
						})}
					</ul>
					{summary.locations.length > TOP_LOCATIONS ? (
						<Button type="button" variant="ghost" size="sm" className="rounded-md" aria-expanded={allLocations} onClick={() => setAllLocations((value) => !value)}>
							{allLocations ? t("keySecurity.showFewerLocations") : t("keySecurity.showAllLocations", { count: summary.locations.length })}
						</Button>
					) : null}
				</section>
			) : null}

			<section ref={keysSection} className="scroll-mt-4 space-y-3">
				<h2 className="text-base font-semibold">{t("keySecurity.keys")}</h2>
				<div role="group" aria-label={t("keySecurity.filterLabel")} className="flex flex-wrap gap-1.5">
					<FilterChip active={filter.kind === "all"} label={t("keySecurity.allKeys")} count={summary.total} onClick={() => choose({ kind: "all" })} />
					{/* The active filter stays visible after a bulk fix takes its count to 0. */}
					{RISK_FILTERS.filter((risk) => summary[risk] > 0 || filter.kind === risk).map((risk) => {
						const Icon = ICONS[risk];
						return (
							<FilterChip key={risk} active={filter.kind === risk} label={t(`keySecurity.filters.${risk}` as never)} count={summary[risk]} title={t(`keySecurity.help.${risk}` as never)} onClick={() => choose({ kind: risk })}>
								<Icon aria-hidden="true" className={cn("size-3.5", TONES[risk].icon)} />
							</FilterChip>
						);
					})}
					{/* Locations are chosen from "Where keys are stored"; only the chosen one shows here. */}
					{filter.kind === "location" ? (
						<FilterChip active label={nameOf(filter.id)} count={summary.locations.find((location) => location.id === filter.id)?.keys ?? visible.length} onClick={() => choose({ kind: "all" })}>
							<KeyStorageLogo id={filter.id} className="size-3.5" />
						</FilterChip>
					) : null}
				</div>
				<div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
					<span>
						{t("keySecurity.showing", { shown: visible.length, total: summary.total })}
						{filter.kind === "location" ? ` · ${t("keySecurity.keysIn", { name: nameOf(filter.id) })}` : filter.kind !== "all" ? ` · ${t(`keySecurity.help.${filter.kind}` as never)}` : ""}
					</span>
					{filter.kind !== "all" ? <Button type="button" variant="ghost" size="sm" className="h-7 rounded-md" onClick={() => choose({ kind: "all" })}>{t("keySecurity.clearFilter")}</Button> : null}
					{data.keys.length < summary.total ? <p className="w-full text-xs">{t("keySecurity.partial", { shown: data.keys.length, total: summary.total })}</p> : null}
				</div>

				{canManage && selectedVisible.length > 0 ? (
					<div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm">
						<span className="px-1 font-medium">{t("keySecurity.selected", { count: selectedVisible.length })}</span>
						<Button type="button" size="sm" variant="outline" className="rounded-md" onClick={() => open("pause", selectedVisible, t("keySecurity.actions.pause"))}>{t("keySecurity.actions.pause")}</Button>
						<Button type="button" size="sm" variant="outline" className="rounded-md" onClick={() => open("set_monthly_spend_limit", selectedVisible, t("keySecurity.actions.set_monthly_spend_limit"))}>{t("keySecurity.actions.set_monthly_spend_limit")}</Button>
						<Button type="button" size="sm" variant="outline" className="rounded-md" onClick={() => open("set_expiry", selectedVisible, t("keySecurity.actions.set_expiry"))}>{t("keySecurity.actions.set_expiry")}</Button>
						<Button type="button" size="sm" variant="outline" className="rounded-md" onClick={() => open("set_storage_locations", selectedVisible, t("keySecurity.actions.set_storage_locations"))}>{t("keySecurity.actions.set_storage_locations")}</Button>
						<Button type="button" size="sm" variant="outline" className="rounded-md" onClick={() => copyOwners(selectedKeys)}><ClipboardCopy className="size-4" />{t("keySecurity.copyOwners")}</Button>
						<Button type="button" size="sm" variant="destructive" className="rounded-md" onClick={() => open("revoke", selectedVisible, t("keySecurity.actions.revoke"))}>{t("keySecurity.actions.revoke")}</Button>
					</div>
				) : null}

				<div className="overflow-x-auto rounded-md border">
					<table className="w-full text-sm">
						<thead className="border-b bg-muted/40 text-left text-muted-foreground">
							<tr>
								{canManage ? (
									<th className="w-10 p-3">
										<Checkbox
											checked={allSelected}
											indeterminate={selectedVisible.length > 0 && !allSelected}
											onCheckedChange={(checked) => setSelected(checked ? new Set(visibleIds.slice(0, maxBulkKeys)) : new Set())}
											aria-label={t("keySecurity.selectAll")}
										/>
									</th>
								) : null}
								<SortableTableHead className="h-auto p-3 font-medium text-muted-foreground" label={t("keySecurity.columns.key")} sortKey="name" activeSort={sort} onSortChange={changeSort} />
								<SortableTableHead className="h-auto p-3 font-medium text-muted-foreground" label={t("keySecurity.columns.owner")} sortKey="owner" activeSort={sort} onSortChange={changeSort} />
								<SortableTableHead className="h-auto p-3 font-medium text-muted-foreground" label={t("keySecurity.columns.created")} sortKey="created" activeSort={sort} onSortChange={changeSort} />
								<SortableTableHead className="h-auto p-3 font-medium text-muted-foreground" label={t("keySecurity.columns.lastUsed")} sortKey="lastUsed" activeSort={sort} onSortChange={changeSort} />
								<SortableTableHead className="h-auto p-3 font-medium text-muted-foreground" label={t("keySecurity.columns.expires")} sortKey="expires" activeSort={sort} onSortChange={changeSort} />
								<SortableTableHead className="h-auto p-3 font-medium text-muted-foreground" label={t("keySecurity.columns.storedIn")} sortKey="storedIn" activeSort={sort} onSortChange={changeSort} />
								<SortableTableHead className="h-auto p-3 font-medium text-muted-foreground" label={t("keySecurity.columns.status")} sortKey="status" activeSort={sort} onSortChange={changeSort} />
								<SortableTableHead className="h-auto p-3 font-medium text-muted-foreground" label={t("keySecurity.columns.risks")} sortKey="risks" activeSort={sort} onSortChange={changeSort} />
							</tr>
						</thead>
						<tbody className="divide-y">
							{visible.map((key) => (
								<tr key={key.id} className={cn(selected.has(key.id) && "bg-muted/30")}>
									{canManage ? (
										<td className="p-3">
											<Checkbox
												checked={selected.has(key.id)}
												onCheckedChange={(checked) => setSelected((current) => {
													const next = new Set(current);
													if (checked) next.add(key.id); else next.delete(key.id);
													return next;
												})}
												aria-label={t("keySecurity.selectKey", { name: key.name })}
											/>
										</td>
									) : null}
									<td className="p-3">
										<Link href={keyDetailHref({ name: key.name, prefix: key.prefix, workspace_id: data.workspaceId })} className="font-medium hover:underline">{key.name}</Link>
										<div className="font-mono text-xs text-muted-foreground">{key.prefix}…</div>
									</td>
									<td className="p-3">
										<div>{key.owner_name ?? t("keySecurity.unknownOwner")}</div>
										{key.owner_email ? <div className="text-xs text-muted-foreground">{key.owner_email}</div> : null}
									</td>
									<td className="p-3 whitespace-nowrap"><DisplayDate value={key.created_at} /></td>
									<td className="p-3 whitespace-nowrap">{key.last_used_at ? <DisplayDate value={key.last_used_at} /> : t("keySecurity.neverUsed")}</td>
									<td className="p-3 whitespace-nowrap">{key.expires_at ? <DisplayDate value={key.expires_at} /> : t("keySecurity.never")}</td>
									<td className="p-3">{key.storage_locations.length ? <KeyStorageLocationList value={key.storage_locations} className="text-xs" /> : <span className="text-muted-foreground">{t("keySecurity.notSet")}</span>}</td>
									<td className="p-3"><Tag kind={keySecurityStatus(key)} label={statusLabel[keySecurityStatus(key)]} /></td>
									<td className="p-3">
										<div className="flex flex-wrap gap-1">
											{keySecurityRisks(key).map((risk) => <Tag key={risk} kind={risk} label={t(`keySecurity.risks.${risk}` as never)} />)}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{!canManage ? <p className="text-xs text-muted-foreground">{t("keySecurity.adminOnly")}</p> : null}
			</section>

			<Dialog open={pending !== null} onOpenChange={(value: boolean) => { if (!value && !busy) setPending(null); }}>
				<DialogContent className="gap-5 sm:max-w-lg">
					<DialogHeader className="gap-2">
						<DialogTitle>{pending?.label}</DialogTitle>
						<DialogDescription>
							{pending ? confirmMessage[pending.action](pending.count) : null}
						</DialogDescription>
					</DialogHeader>
					{pending?.action === "set_monthly_spend_limit" ? (
						<div className="space-y-2">
							<label htmlFor="bulk-spend-limit" className="text-sm font-medium">{t("keySecurity.monthlyLimitUsd")}</label>
							<Input id="bulk-spend-limit" type="number" min="0.01" step="0.01" inputMode="decimal" value={spendLimitUsd} onChange={(event) => setSpendLimitUsd(event.target.value)} placeholder="50" />
						</div>
					) : null}
					{pending?.action === "set_expiry" ? (
						<div className="space-y-2">
							<label htmlFor="bulk-expiry" className="text-sm font-medium">{t("keySecurity.expiresOn")}</label>
							<Input id="bulk-expiry" type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
						</div>
					) : null}
					{pending?.action === "set_storage_locations" ? (
						<KeyStorageLocationPicker value={locations} onChange={setLocations} disabled={busy} />
					) : null}
					{pending?.action === "revoke" ? (
						<div className="space-y-2">
							<label htmlFor="bulk-revoke-confirm" className="text-sm font-medium">{t("keySecurity.typeRevoke")}</label>
							<Input id="bulk-revoke-confirm" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" placeholder={REVOKE_CONFIRMATION} />
						</div>
					) : null}
					<DialogFooter>
						<Button type="button" variant="ghost" className="rounded-md" disabled={busy} onClick={() => setPending(null)}>{t("strings.Cancel" as never)}</Button>
						<Button type="button" className="rounded-md" variant={pending?.action === "revoke" ? "destructive" : "default"} disabled={!ready} onClick={run}>
							{busy ? t("keySecurity.working") : pending?.label}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
