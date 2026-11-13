import { useMemo } from "react";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { ArrowUpDown, Search } from "lucide-react";
import Link from "@/components/link";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { getPlanSortKey, resolveSubscriptionOrganisationName } from "@/components/(data)/model/pricing/ModelSubscriptionsClient";
import { bestPlanPerModel, summarizeUsage } from "@/lib/fetchers/subscription-plans/usage";
import type { SubscriptionPlanSummary } from "@/lib/fetchers/subscription-plans/types";
import { formatSubscriptionPlanMessage, type SubscriptionPlansMessages } from "@/i18n/subscription-plans";
import { UsageSourceNote } from "./SubscriptionPlanUsage";
import { useSubscriptionFormat, type SubscriptionFormat } from "./useSubscriptionFormat";

const SORTS = ["provider", "price", "tokens", "value"] as const;
type Sort = (typeof SORTS)[number];
const BEST_VALUE_ROWS = 8;

/** The list payload is the full catalogue, so each plan also carries its model list. */
type ListPlan = SubscriptionPlanSummary & { models?: unknown[] };

type PlanRow = {
	plan: ListPlan;
	organisationId: string;
	organisationName: string;
	priceKey: ReturnType<typeof getPlanSortKey>;
	usage: ReturnType<typeof summarizeUsage>;
};

const byNullable = (a: number | null | undefined, b: number | null | undefined, direction: 1 | -1 = 1) =>
	a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : (a - b) * direction;

function comparePrice(a: PlanRow, b: PlanRow) {
	return byNullable(a.priceKey?.currencyRank, b.priceKey?.currencyRank) || byNullable(a.priceKey?.monthlyEquivalent, b.priceKey?.monthlyEquivalent);
}

export function sortPlanRows(rows: PlanRow[], sort: Sort): PlanRow[] {
	return rows.toSorted((a, b) => {
		const byName = a.organisationName.localeCompare(b.organisationName) || a.plan.name.localeCompare(b.plan.name);
		if (sort === "price") return comparePrice(a, b) || byName;
		if (sort === "tokens") return byNullable(a.usage?.mostTokens.monthly_tokens, b.usage?.mostTokens.monthly_tokens, -1) || byName;
		if (sort === "value") return byNullable(a.usage?.cheapest?.effective_usd_per_mtok, b.usage?.cheapest?.effective_usd_per_mtok) || byName;
		return a.organisationName.localeCompare(b.organisationName) || comparePrice(a, b) || a.plan.name.localeCompare(b.plan.name);
	});
}

function PlanIdentity({ plan, organisationId, organisationName, price }: { plan: ListPlan; organisationId: string; organisationName: string; price?: string | null }) {
	return (
		<div className="flex min-w-0 items-center gap-3">
			<span className="relative flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background">
				<span className="relative size-5"><Logo id={organisationId} alt="" fill className="object-contain" /></span>
			</span>
			<div className="min-w-0">
				<Link href={`/subscription-plans/${plan.plan_id}`} className="block truncate font-medium underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current">{plan.name}</Link>
				<p className="truncate text-xs text-muted-foreground">{organisationName}</p>
				{price ? <p className="truncate text-xs tabular-nums sm:hidden">{price}</p> : null}
			</div>
		</div>
	);
}

function BestValue({ plans, format }: { plans: ListPlan[]; format: SubscriptionFormat }) {
	const { messages } = format;
	const rows = bestPlanPerModel(plans).slice(0, BEST_VALUE_ROWS);
	if (!rows.length) return null;
	const maxMultiple = Math.max(...rows.map(({ usage }) => (usage.share_of_api_price ? 1 / usage.share_of_api_price : 0)));
	return (
		<section aria-labelledby="best-value-heading" className="space-y-3">
			<div className="space-y-1">
				<h2 id="best-value-heading" className="text-lg font-semibold">{messages.list.bestValueTitle}</h2>
				<p className="max-w-3xl text-sm text-muted-foreground">{messages.list.bestValueDescription}</p>
			</div>
			<div className="overflow-x-auto rounded-md border border-border/70">
				<Table aria-label={messages.list.bestValueTitle}>
					<TableHeader className="bg-muted/40">
						<TableRow>
							<TableHead scope="col" className="px-4">{messages.usage.model}</TableHead>
							<TableHead scope="col" className="hidden px-4 sm:table-cell">{messages.list.plan}</TableHead>
							<TableHead scope="col" className="px-4 text-right">{messages.usage.perMillion}</TableHead>
							<TableHead scope="col" className="px-4 text-right sm:w-[30%] sm:min-w-36 sm:text-left">{messages.usage.vsApi}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map(({ plan, usage }) => {
							const multiple = usage.share_of_api_price ? 1 / usage.share_of_api_price : null;
							return (
								<TableRow key={usage.model_slug}>
									<TableCell className="px-4 py-2.5">
										<Link href={`/models/${usage.model_slug}`} className="font-medium underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current">{usage.model_name ?? usage.model_slug}</Link>
										<p className="text-xs text-muted-foreground sm:hidden">{formatSubscriptionPlanMessage(messages.list.onPlan, { plan: plan.name })}</p>
									</TableCell>
									<TableCell className="hidden px-4 py-2.5 sm:table-cell">
										<Link href={`/subscription-plans/${plan.plan_id}`} className="text-sm underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current">{plan.name}</Link>
										<span className="text-xs text-muted-foreground"> · {format.tokens(usage.monthly_tokens)}</span>
									</TableCell>
									<TableCell className="px-4 py-2.5 text-right font-medium tabular-nums">{format.perMillion(usage.effective_usd_per_mtok)}</TableCell>
									<TableCell className="px-4 py-2.5">
										{multiple ? (
											<div className="flex items-center justify-end gap-3 sm:justify-start" title={format.shareOfApi(usage) ?? undefined}>
												<span aria-hidden="true" className="hidden h-1.5 flex-1 overflow-hidden rounded-[2px] bg-muted sm:block">
													<span className="block h-full rounded-[2px] bg-emerald-600/80 dark:bg-emerald-400/80" style={{ width: `${Math.max(3, (multiple / maxMultiple) * 100)}%` }} />
												</span>
												<span className="shrink-0 text-right text-sm font-medium tabular-nums text-emerald-700 sm:w-24 dark:text-emerald-400">{format.multiple(usage) ?? format.vsApi(usage)?.text}</span>
											</div>
										) : <span className="text-sm text-muted-foreground" title={messages.usage.noApiPrice}>—</span>}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>
		</section>
	);
}

interface SubscriptionPlansDisplayProps {
	plans: SubscriptionPlanSummary[];
	labels: SubscriptionPlansMessages;
}

export default function SubscriptionPlansDisplay({ plans, labels }: SubscriptionPlansDisplayProps) {
	const format = useSubscriptionFormat();
	const list = labels.list;
	const [filters, setFilters] = useQueryStates({
		search: parseAsString.withDefault(""),
		provider: parseAsString.withDefault(""),
		sort: parseAsStringLiteral(SORTS).withDefault("provider"),
		measured: parseAsString.withDefault(""),
	});

	const rows = useMemo<PlanRow[]>(() => (plans as ListPlan[]).flatMap((plan) => {
		const organisationId = plan.organisation?.organisation_id ?? plan.organisation_id;
		if (!organisationId) return [];
		return [{ plan, organisationId, organisationName: resolveSubscriptionOrganisationName(plan.organisation?.name, organisationId), priceKey: getPlanSortKey(plan.prices ?? []), usage: summarizeUsage(plan.usage) }];
	}), [plans]);

	const providers = useMemo(() => [...new Map(rows.map((row) => [row.organisationId, row.organisationName])).entries()]
		.toSorted((a, b) => a[1].localeCompare(b[1])), [rows]);

	const visible = useMemo(() => {
		const query = filters.search.trim().toLowerCase();
		return sortPlanRows(rows.filter((row) =>
			(!filters.provider || row.organisationId === filters.provider)
			&& (!filters.measured || row.usage)
			&& (!query || row.plan.name.toLowerCase().includes(query) || row.organisationName.toLowerCase().includes(query) || row.plan.description?.toLowerCase().includes(query)),
		), filters.sort);
	}, [rows, filters]);

	const hasUsage = rows.some((row) => row.usage);
	const sortLabels: Record<Sort, string> = { provider: list.sortProvider, price: list.sortPrice, tokens: list.sortTokens, value: list.sortValue };

	return (
		<div className="space-y-8">
			<header className="space-y-1">
				<h1 className="text-2xl font-bold tracking-tight">{labels.title}</h1>
				<p className="max-w-3xl text-sm text-muted-foreground">{labels.description}</p>
			</header>

			{hasUsage ? <BestValue plans={rows.map((row) => row.plan)} format={format} /> : null}

			<section className="space-y-3">
				<div className="flex flex-col gap-2 md:flex-row md:items-center">
					<div className="relative w-full md:max-w-xs">
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
						<Input aria-label={labels.search} placeholder={labels.search} value={filters.search} onChange={(event) => void setFilters({ search: event.target.value || null })} className="w-full rounded-md bg-background pl-9" />
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Select value={filters.provider || "all"} onValueChange={(value) => void setFilters({ provider: value === "all" ? null : value })}>
							<SelectTrigger className="w-44 rounded-md" aria-label={list.sortProvider}>
								<span className="truncate">{providers.find(([id]) => id === filters.provider)?.[1] ?? list.allProviders}</span>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">{list.allProviders}</SelectItem>
								{providers.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
							</SelectContent>
						</Select>
						<Select value={filters.sort} onValueChange={(value) => void setFilters({ sort: value === "provider" ? null : (value as Sort) })}>
							<SelectTrigger className="w-56 rounded-md" aria-label={list.sortLabel}>
								<span className="flex min-w-0 items-center gap-2"><ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="truncate">{sortLabels[filters.sort]}</span></span>
							</SelectTrigger>
							<SelectContent>
								{SORTS.filter((sort) => hasUsage || (sort !== "tokens" && sort !== "value")).map((sort) => <SelectItem key={sort} value={sort}>{sortLabels[sort]}</SelectItem>)}
							</SelectContent>
						</Select>
						{hasUsage ? (
							<label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
								<Switch size="sm" checked={Boolean(filters.measured)} onCheckedChange={(checked) => void setFilters({ measured: checked ? "1" : null })} />
								{list.measuredOnly}
							</label>
						) : null}
					</div>
					<p className="text-sm text-muted-foreground md:ml-auto">{formatSubscriptionPlanMessage(list.resultCount, { count: visible.length })}</p>
				</div>

				{visible.length ? (
					<div className="overflow-x-auto rounded-md border border-border/70">
						<Table aria-label={labels.title}>
							<TableHeader className="bg-muted/40">
								<TableRow>
									<TableHead scope="col" className="px-4">{list.plan}</TableHead>
									<TableHead scope="col" className="hidden px-4 sm:table-cell">{list.price}</TableHead>
									<TableHead scope="col" className="hidden px-4 text-right md:table-cell">{list.models}</TableHead>
									{hasUsage ? <TableHead scope="col" className="hidden px-4 text-right sm:table-cell">{labels.usage.tokensPerMonth}</TableHead> : null}
									{hasUsage ? <TableHead scope="col" className="px-4 text-right">{labels.usage.perMillion}</TableHead> : null}
								</TableRow>
							</TableHeader>
							<TableBody>
								{visible.map((row) => {
									const price = format.primaryPrice(row.plan.prices);
									return (
										<TableRow key={row.plan.plan_uuid}>
											<TableCell className="w-full max-w-0 px-3 py-2.5 sm:w-auto sm:max-w-72 sm:px-4"><PlanIdentity plan={row.plan} organisationId={row.organisationId} organisationName={row.organisationName} price={price ? format.price(price) : null} /></TableCell>
											<TableCell className="hidden px-4 py-2.5 text-sm tabular-nums sm:table-cell">
												{price ? format.price(price) : <span className="text-muted-foreground">—</span>}
											</TableCell>
											<TableCell className="hidden px-4 py-2.5 text-right tabular-nums text-muted-foreground md:table-cell">{row.plan.models?.length || "—"}</TableCell>
											{hasUsage ? (
												<TableCell className="hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">
													{row.usage ? <><span>{format.tokens(row.usage.mostTokens.monthly_tokens)}</span><p className="truncate text-xs text-muted-foreground">{row.usage.mostTokens.model_name}</p></> : <span className="text-muted-foreground">—</span>}
												</TableCell>
											) : null}
											{hasUsage ? (
												<TableCell className="px-4 py-2.5 text-right tabular-nums">
													{row.usage?.cheapest ? <><span className="font-medium">{format.perMillion(row.usage.cheapest.effective_usd_per_mtok)}</span>{format.multiple(row.usage.cheapest) ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{format.multiple(row.usage.cheapest)}</p> : null}</> : <span className="text-muted-foreground">—</span>}
												</TableCell>
											) : null}
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				) : (
					<Empty className="rounded-md border">
						<EmptyHeader>
							<EmptyMedia variant="icon" className="rounded-md"><Search aria-hidden="true" /></EmptyMedia>
							<EmptyTitle>{labels.empty}</EmptyTitle>
						</EmptyHeader>
					</Empty>
				)}
				{hasUsage ? <UsageSourceNote /> : null}
			</section>
		</div>
	);
}
