import { Link } from "@/i18n/navigation";
import { useTranslations } from "@/i18n/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { summarizeUsage, type SubscriptionPlanUsage } from "@/lib/fetchers/subscription-plans/usage";
import type { SubscriptionPlanModel } from "@/lib/fetchers/subscription-plans/types";
import { formatSubscriptionPlanMessage } from "@/i18n/subscription-plans";
import { useSubscriptionFormat } from "./useSubscriptionFormat";

type Row = { model: SubscriptionPlanModel; usage: ReturnType<typeof summarizeUsage> };

/** Models with measured usage first (most tokens first), then by name. */
export function planModelRows(models: SubscriptionPlanModel[], usage: SubscriptionPlanUsage[] = []): Row[] {
	const byModel = new Map<string, SubscriptionPlanUsage[]>();
	for (const row of usage) byModel.set(row.model_slug, [...(byModel.get(row.model_slug) ?? []), row]);
	return models
		.map((model) => ({ model, usage: summarizeUsage(byModel.get(model.model_id)) }))
		.toSorted((a, b) =>
			Number(!a.usage) - Number(!b.usage)
			|| (b.usage?.mostTokens.monthly_tokens ?? 0) - (a.usage?.mostTokens.monthly_tokens ?? 0)
			|| a.model.model.name.localeCompare(b.model.model.name));
}

/** A model's rate limit as text, or null when there isn't one: a blank string or an empty object or list. */
export function rateLimitText(value: unknown): string | null {
	if (value == null) return null;
	if (typeof value === "string") return value.trim() || null;
	if (typeof value === "object" && Object.keys(value).length === 0) return null;
	return JSON.stringify(value);
}

type AccessLabel = "example" | "unverified" | "included" | "automatic";

/**
 * What the access column says for a model. A checked link with no channel or conditions still says how it's
 * offered ("Included" or "Used automatically") rather than a dash that reads as missing data.
 */
export function accessText(model: Pick<SubscriptionPlanModel, "mapping_status" | "access_mode" | "access_channel" | "conditions">, label: (key: AccessLabel) => string): string {
	const status = model.mapping_status === "example" ? label("example") : model.mapping_status === "unverified" ? label("unverified") : null;
	const parts = [status, model.access_channel, model.conditions].filter(Boolean);
	if (parts.length) return parts.join(" · ");
	if (model.access_mode === "selectable") return label("included");
	if (model.access_mode === "automatic") return label("automatic");
	return "";
}

export default function SubscriptionPlanModelsTable({ models, usage, limit }: { models: SubscriptionPlanModel[]; usage?: SubscriptionPlanUsage[]; limit?: number }) {
	const access = useTranslations("Common.ui.subscriptionCatalog");
	const format = useSubscriptionFormat();
	const { messages } = format;
	const rows = planModelRows(models, usage).slice(0, limit);
	const hasUsage = rows.some((row) => row.usage);
	// The oldest check among the rows shown, so no row looks fresher than it is. If any shown row has no
	// check date, the date is left out rather than implying that row was checked.
	const checkDates = rows.map(({ model }) => model.verified_at);
	const verified = checkDates.length && checkDates.every(Boolean) ? (checkDates as string[]).toSorted()[0] : null;
	return (
		<div className="space-y-2">
		<div className="overflow-x-auto rounded-md border border-border/70">
			<Table aria-label={access("plan_model_access")}>
				<TableHeader className="bg-muted/40">
					<TableRow>
						<TableHead scope="col" className="px-4">{messages.usage.model}</TableHead>
						<TableHead scope="col" className="hidden px-4 sm:table-cell">{messages.detail.access}</TableHead>
						{hasUsage ? <TableHead scope="col" className="px-4 text-right">{messages.usage.tokensPerMonth}</TableHead> : null}
						{hasUsage ? <TableHead scope="col" className="px-4 text-right">{messages.usage.perMillion}</TableHead> : null}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map(({ model, usage: summary }) => {
						const rateLimit = rateLimitText(model.rate_limit);
						const accessLabel = accessText(model, (key) => access(key));
						return (
							<TableRow key={model.model_id}>
								<TableCell className="px-4 py-3">
									<Link href={`/models/${model.model_id}`} className="font-medium underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current">{model.model.name}</Link>
									{model.model.organisation_name ? <p className="text-xs text-muted-foreground">{model.model.organisation_name}</p> : null}
									{/* Phones have no access column, so keep its qualifications under the name. */}
									{accessLabel ? <p className="text-xs text-muted-foreground sm:hidden">{accessLabel}</p> : null}
									{rateLimit ? <p className="text-xs text-muted-foreground">{formatSubscriptionPlanMessage(messages.detail.rateLimit, { limit: rateLimit })}</p> : null}
								</TableCell>
								<TableCell className="hidden px-4 py-3 text-sm text-muted-foreground sm:table-cell">{accessLabel || "—"}</TableCell>
								{hasUsage ? <TableCell className="px-4 py-3 text-right tabular-nums">{summary ? <>{format.tokens(summary.mostTokens.monthly_tokens)}{format.scenario(summary.mostTokens.scenario) ? <p className="text-xs text-muted-foreground">{format.scenario(summary.mostTokens.scenario)}</p> : null}</> : <span className="text-muted-foreground">—</span>}</TableCell> : null}
								{hasUsage ? (
									<TableCell className="px-4 py-3 text-right tabular-nums">
										{summary?.cheapest ? <span className="font-medium">{format.perMillion(summary.cheapest.effective_usd_per_mtok)}</span> : <span className="text-muted-foreground">—</span>}
										{summary?.cheapest && format.multiple(summary.cheapest) ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{format.multiple(summary.cheapest)}</p> : null}
										{summary?.cheapest && format.scenario(summary.cheapest.scenario) ? <p className="text-xs text-muted-foreground">{format.scenario(summary.cheapest.scenario)}</p> : null}
									</TableCell>
								) : null}
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
		{verified ? <p className="text-xs text-muted-foreground">{formatSubscriptionPlanMessage(messages.detail.accessVerified, { date: format.date(verified) })}</p> : null}
		</div>
	);
}
