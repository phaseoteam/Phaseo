import Link from "@/components/link";
import { useTranslations } from "@/i18n/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { summarizeUsage, type SubscriptionPlanUsage } from "@/lib/fetchers/subscription-plans/usage";
import type { SubscriptionPlanModel } from "@/lib/fetchers/subscription-plans/types";
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

export default function SubscriptionPlanModelsTable({ models, usage, limit }: { models: SubscriptionPlanModel[]; usage?: SubscriptionPlanUsage[]; limit?: number }) {
	const access = useTranslations("Common.ui.subscriptionCatalog");
	const format = useSubscriptionFormat();
	const { messages } = format;
	const rows = planModelRows(models, usage).slice(0, limit);
	const hasUsage = rows.some((row) => row.usage);
	return (
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
						const accessText = [model.mapping_status === "example" ? access("example") : model.mapping_status === "unverified" ? access("unverified") : null, model.access_channel, model.conditions].filter(Boolean).join(" · ");
						return (
							<TableRow key={model.model_id}>
								<TableCell className="px-4 py-3">
									<Link href={`/models/${model.model_id}`} className="font-medium underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current">{model.model.name}</Link>
									{model.model.organisation_name ? <p className="text-xs text-muted-foreground">{model.model.organisation_name}</p> : null}
								</TableCell>
								<TableCell className="hidden px-4 py-3 text-sm text-muted-foreground sm:table-cell">{accessText || "—"}</TableCell>
								{hasUsage ? <TableCell className="px-4 py-3 text-right tabular-nums">{summary ? format.tokens(summary.mostTokens.monthly_tokens) : <span className="text-muted-foreground">—</span>}</TableCell> : null}
								{hasUsage ? (
									<TableCell className="px-4 py-3 text-right tabular-nums">
										{summary?.cheapest ? <span className="font-medium">{format.perMillion(summary.cheapest.effective_usd_per_mtok)}</span> : <span className="text-muted-foreground">—</span>}
										{summary?.cheapest && format.multiple(summary.cheapest) ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{format.multiple(summary.cheapest)}</p> : null}
									</TableCell>
								) : null}
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}
