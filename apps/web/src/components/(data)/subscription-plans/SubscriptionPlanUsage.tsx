import Link from "@/components/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sortUsage, USAGE_SOURCE_URL, type SubscriptionPlanUsage } from "@/lib/fetchers/subscription-plans/usage";
import { formatSubscriptionPlanMessage } from "@/i18n/subscription-plans";
import { cn } from "@/lib/utils";
import { useSubscriptionFormat, type SubscriptionFormat } from "./useSubscriptionFormat";

/** Credits the usage dataset; its CC BY 4.0 data needs attribution wherever the numbers are shown. */
export function UsageSourceNote({ className }: { className?: string }) {
	const { messages } = useSubscriptionFormat();
	const [before, after] = messages.usage.sourceNote.split("{source}");
	return (
		<p className={cn("text-xs leading-relaxed text-muted-foreground", className)}>
			{before}
			<a href={USAGE_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">real-api-pricing</a>
			{after}
		</p>
	);
}

function UsageModelCell({ row, format, linkModel }: { row: SubscriptionPlanUsage; format: SubscriptionFormat; linkModel: boolean }) {
	const scenario = format.scenario(row.scenario);
	const name = row.model_name ?? row.model_slug;
	return (
		<div className="min-w-0">
			{linkModel ? <Link href={`/models/${row.model_slug}`} className="font-medium underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current">{name}</Link> : <span className="font-medium">{name}</span>}
			{scenario || row.promo_until ? (
				<p className="text-xs text-muted-foreground">
					{[scenario, row.promo_until ? formatSubscriptionPlanMessage(format.messages.usage.promoUntil, { date: format.date(row.promo_until) }) : null].filter(Boolean).join(" · ")}
				</p>
			) : null}
		</div>
	);
}

/** Tokens a month, price per 1M tokens and the saving against API prices, one row per model and scenario. */
export function SubscriptionPlanUsageTable({ usage, linkModels = true }: { usage: SubscriptionPlanUsage[]; linkModels?: boolean }) {
	const format = useSubscriptionFormat();
	const labels = format.messages.usage;
	const rows = sortUsage(usage);
	const maxTokens = Math.max(...rows.map((row) => row.monthly_tokens));
	return (
		<div className="overflow-x-auto rounded-md border border-border/70">
			<Table aria-label={labels.title}>
				<TableHeader className="bg-muted/40">
					<TableRow>
						<TableHead scope="col" className="px-4">{labels.model}</TableHead>
						<TableHead scope="col" className="px-4 sm:w-[28%] sm:min-w-40">{labels.tokensPerMonth}</TableHead>
						<TableHead scope="col" className="px-4 text-right">{labels.perMillion}</TableHead>
						<TableHead scope="col" className="px-4 text-right">{labels.vsApi}</TableHead>
						<TableHead scope="col" className="hidden px-4 md:table-cell">{labels.basis}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow key={`${row.model_slug}:${row.scenario}`}>
							<TableCell className="px-4 py-3"><UsageModelCell row={row} format={format} linkModel={linkModels} /></TableCell>
							<TableCell className="px-4 py-3">
								<div className="flex items-center gap-3">
									<span className="shrink-0 font-medium tabular-nums sm:w-14">{format.tokens(row.monthly_tokens)}</span>
									<span aria-hidden="true" className="hidden h-1.5 flex-1 overflow-hidden rounded-[2px] bg-muted sm:block">
										<span className="block h-full rounded-[2px] bg-primary/70" style={{ width: `${Math.max(2, (row.monthly_tokens / maxTokens) * 100)}%` }} />
									</span>
								</div>
							</TableCell>
							<TableCell className="px-4 py-3 text-right font-medium tabular-nums">{format.perMillion(row.effective_usd_per_mtok) ?? "—"}</TableCell>
							<TableCell className="px-4 py-3 text-right tabular-nums">
								{(() => {
									const vsApi = format.vsApi(row);
									if (!vsApi) return <span className="text-muted-foreground" title={labels.noApiPrice}>—</span>;
									return <span title={format.shareOfApi(row) ?? undefined} className={vsApi.saving ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>{vsApi.text}</span>;
								})()}
							</TableCell>
							<TableCell className="hidden px-4 py-3 text-muted-foreground md:table-cell">
								<span title={format.confidence(row.confidence)}>{format.basis(row.basis)}</span>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

/** The plan detail section: headline numbers, the per-model table and the source note. */
export default function SubscriptionPlanUsageSection({ usage }: { usage: SubscriptionPlanUsage[] }) {
	const { messages } = useSubscriptionFormat();
	if (!usage.length) return null;
	return (
		<section id="plan-usage" className="scroll-mt-36 space-y-4">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold">{messages.usage.title}</h2>
				<p className="max-w-3xl text-sm text-muted-foreground">{messages.usage.description}</p>
			</div>
			<SubscriptionPlanUsageTable usage={usage} />
			<UsageSourceNote />
		</section>
	);
}
