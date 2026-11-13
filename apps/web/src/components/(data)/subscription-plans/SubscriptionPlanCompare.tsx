import Link from "@/components/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSubscriptionPlanMessage } from "@/i18n/subscription-plans";
import { summarizeUsage } from "@/lib/fetchers/subscription-plans/usage";
import type { RelatedSubscriptionPlan } from "@/lib/fetchers/subscription-plans/types";
import { cn } from "@/lib/utils";
import { useSubscriptionFormat } from "./useSubscriptionFormat";

/** The lab's plans side by side, cheapest first, with the current plan marked. */
export default function SubscriptionPlanCompare({ planId, provider, plans }: { planId: string; provider: string; plans: RelatedSubscriptionPlan[] }) {
	const format = useSubscriptionFormat();
	const { messages } = format;
	if (plans.length < 2) return null;
	const rows = plans.map((plan) => ({ plan, usage: summarizeUsage(plan.usage) }));
	const hasUsage = rows.some((row) => row.usage);
	const title = formatSubscriptionPlanMessage(messages.detail.compareTitle, { provider });
	return (
		<section id="plan-compare" className="scroll-mt-36 space-y-4">
			<h2 className="text-xl font-semibold">{title}</h2>
			<div className="overflow-x-auto rounded-md border border-border/70">
				<Table aria-label={title}>
					<TableHeader className="bg-muted/40">
						<TableRow>
							<TableHead scope="col" className="px-4">{messages.list.plan}</TableHead>
							<TableHead scope="col" className="px-4 text-right">{messages.detail.pricePerMonth}</TableHead>
							{hasUsage ? <TableHead scope="col" className="hidden px-4 text-right sm:table-cell">{messages.usage.tokensPerMonth}</TableHead> : null}
							{hasUsage ? <TableHead scope="col" className="px-4 text-right">{messages.usage.perMillion}</TableHead> : null}
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map(({ plan, usage }) => {
							const current = plan.plan_id === planId;
							return (
								<TableRow key={plan.plan_id} aria-current={current ? "true" : undefined} className={cn(current && "bg-muted/40")}>
									<TableCell className="px-4 py-2.5">
										{current ? <span className="font-medium">{plan.name}</span> : <Link href={`/subscription-plans/${plan.plan_id}`} className="font-medium underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current">{plan.name}</Link>}
										{current ? <span className="ml-2 text-xs text-muted-foreground">{messages.detail.thisPlan}</span> : null}
									</TableCell>
									<TableCell className="px-4 py-2.5 text-right tabular-nums">{plan.monthly_price_usd == null ? <span className="text-muted-foreground">—</span> : format.perMonth(plan.monthly_price_usd)}</TableCell>
									{hasUsage ? <TableCell className="hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">{usage ? <>{format.tokens(usage.mostTokens.monthly_tokens)}<p className="truncate text-xs text-muted-foreground">{usage.mostTokens.model_name}</p></> : <span className="text-muted-foreground">—</span>}</TableCell> : null}
									{hasUsage ? <TableCell className="px-4 py-2.5 text-right tabular-nums">{usage?.cheapest ? format.perMillion(usage.cheapest.effective_usd_per_mtok) : <span className="text-muted-foreground">—</span>}</TableCell> : null}
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>
		</section>
	);
}
