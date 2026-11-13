import { ReactNode } from "react";
import Link from "@/components/link";
import { CreditCard, ExternalLink } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useSuspenseQuery } from "@tanstack/react-query";
import { subscriptionPlanQuery } from "./SubscriptionPlanDetailShell.queries";
import { Logo } from "@/components/Logo";
import EntityStickyHeader from "@/components/(data)/EntityStickyHeader";
import ModelPageToc, { type ModelPageTocItem } from "@/components/(data)/model/ModelPageToc";
import { Button } from "@/components/ui/button";
import { formatSubscriptionPlanMessage } from "@/i18n/subscription-plans";
import { summarizeUsage } from "@/lib/fetchers/subscription-plans/usage";
import type { SubscriptionPlanDetails } from "@/lib/fetchers/subscription-plans/types";
import { cn } from "@/lib/utils";
import { useSubscriptionFormat } from "./useSubscriptionFormat";

interface SubscriptionPlanDetailShellProps {
	planId: string;
	children: ReactNode;
	tocItems?: ModelPageTocItem[];
	tab?: "overview" | "features" | "models";
}

function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
	return (
		<div className="min-w-0 bg-background px-4 py-3">
			<p className="text-xs text-muted-foreground">{label}</p>
			<p className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</p>
			{detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
		</div>
	);
}

function PlanStats({ plan }: { plan: SubscriptionPlanDetails }) {
	const format = useSubscriptionFormat();
	const { messages } = format;
	const summary = summarizeUsage(plan.usage);
	const price = format.primaryPrice(plan.prices);
	const stats = [
		price ? <Stat key="price" label={messages.detail.price} value={format.price(price)} detail={plan.prices.length > 1 ? formatSubscriptionPlanMessage(messages.detail.billingOptionCount, { count: plan.prices.length }) : undefined} /> : null,
		<Stat key="models" label={messages.detail.modelsIncluded} value={plan.models?.length ?? 0} />,
		summary ? <Stat key="tokens" label={messages.usage.tokensPerMonth} value={format.tokens(summary.mostTokens.monthly_tokens)} detail={summary.mostTokens.model_name ?? summary.mostTokens.model_slug} /> : null,
		summary?.cheapest ? <Stat key="value" label={messages.usage.lowestCost} value={format.perMillion(summary.cheapest.effective_usd_per_mtok)} detail={[summary.cheapest.model_name ?? summary.cheapest.model_slug, format.multiple(summary.cheapest)].filter(Boolean).join(" · ")} /> : null,
	].filter(Boolean);
	return (
		<div className={cn("grid gap-px overflow-hidden rounded-md border border-border/70 bg-border/70", stats.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : stats.length === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
			{stats}
		</div>
	);
}

export default function SubscriptionPlanDetailShell({
	planId,
	children,
	tocItems = [],
	tab = "overview",
}: SubscriptionPlanDetailShellProps) {
	const { data: plan } = useSuspenseQuery(subscriptionPlanQuery(planId));
	const { messages } = useSubscriptionFormat();

	if (!plan) {
		return (
			<main className="flex min-h-screen flex-col">
				<div className="container mx-auto px-4 py-8">
					<Empty className="rounded-md border bg-muted/30">
						<EmptyHeader>
							<EmptyMedia variant="icon" className="rounded-md"><CreditCard aria-hidden="true" /></EmptyMedia>
							<EmptyTitle>{messages.detail.unknownPlan}</EmptyTitle>
							<EmptyDescription>{messages.detail.unknownPlanDescription}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</div>
			</main>
		);
	}

	const organisationId = plan.organisation?.organisation_id ?? planId;
	const baseHref = `/subscription-plans/${planId}`;
	const navigation = [
		{ key: "overview", label: messages.detail.overview, href: baseHref, count: null },
		{ key: "models", label: messages.detail.models, href: `${baseHref}/models`, count: plan.models?.length ?? 0 },
		{ key: "features", label: messages.detail.features, href: `${baseHref}/features`, count: plan.features?.length ?? 0 },
	] as const;
	const planUrl = plan.link ?? plan.offers?.find((offer) => offer.purchase_url)?.purchase_url ?? null;

	return (
		<main className="flex flex-col">
			<EntityStickyHeader kind="subscription" id={organisationId} name={plan.name} observeId="subscription-detail-primary-header" baseHref={baseHref} navigation={navigation.map(({ label, href }) => ({ label, href }))} />
			<div className="container mx-auto px-4 py-6 md:py-8">
				<div id="subscription-detail-primary-header" className="flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex min-w-0 items-center gap-4">
						<div className="relative flex size-14 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card/40">
							<div className="relative size-10">
								<Logo id={organisationId} alt={plan.organisation?.name ?? plan.name} className="object-contain" fill />
							</div>
						</div>
						<div className="min-w-0">
							<h1 className="truncate text-3xl font-bold tracking-tight">{plan.name}</h1>
							<Link href={`/organisations/${organisationId}`} className="mt-1 inline-flex text-sm font-medium text-muted-foreground underline decoration-transparent underline-offset-4 transition-colors hover:text-foreground hover:decoration-current">
								{plan.organisation?.name ?? messages.detail.unknownProvider}
							</Link>
						</div>
					</div>
					{planUrl ? (
						<Button asChild variant="outline" size="sm" className="shrink-0 self-start rounded-md">
							<a href={planUrl} target="_blank" rel="noopener noreferrer">{messages.detail.viewPlan}<ExternalLink className="size-3.5" aria-hidden="true" /></a>
						</Button>
					) : null}
				</div>
				{plan.description ? <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">{plan.description}</p> : null}
				<div className="mt-6"><PlanStats plan={plan} /></div>
				<nav aria-label={plan.name} className="mt-6 flex gap-1 border-b border-border/70">
					{navigation.map((item) => (
						<Link
							key={item.key}
							href={item.href}
							aria-current={tab === item.key ? "page" : undefined}
							className={cn("-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
								tab === item.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
						>
							{item.label}
							{item.count ? <span className="text-xs tabular-nums text-muted-foreground">{item.count}</span> : null}
						</Link>
					))}
				</nav>
				<div className="mt-6 min-h-full">{tocItems.length ? <div className="flex flex-col gap-6 lg:flex-row lg:items-start"><ModelPageToc items={tocItems} className="lg:h-full lg:w-40 lg:shrink-0 xl:w-44" /><div className="min-w-0 flex-1">{children}</div></div> : children}</div>
			</div>
		</main>
	);
}
