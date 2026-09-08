import { ReactNode } from "react";
import Link from "next/link";
import { CreditCard, List, PanelsTopLeft, Sparkles } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { fetchFrontendSubscriptionPlan } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { Logo } from "@/components/Logo";
import EntityStickyHeader from "@/components/(data)/EntityStickyHeader";
import ModelPageToc, { type ModelPageTocItem } from "@/components/(data)/model/ModelPageToc";
import { Button } from "@/components/ui/button";
import RotatingPricing from "@/components/(data)/subscription-plans/RotatingPricing";

interface SubscriptionPlanDetailShellProps {
	planId: string;
	children: ReactNode;
	tocItems?: ModelPageTocItem[];
	tab?: "overview" | "features" | "models";
}

export default async function SubscriptionPlanDetailShell({
	planId,
	children,
	tocItems = [],
	tab = "overview",
}: SubscriptionPlanDetailShellProps) {
	const plan = await fetchFrontendSubscriptionPlan(planId);

	if (!plan) {
		return (
			<main className="flex min-h-screen flex-col">
				<div className="container mx-auto px-4 py-8">
					<Empty className="rounded-md border bg-muted/30">
						<EmptyHeader>
							<EmptyMedia variant="icon" className="rounded-md"><CreditCard aria-hidden="true" /></EmptyMedia>
							<EmptyTitle>Subscription plan not found</EmptyTitle>
							<EmptyDescription>This subscription plan may have been removed or is no longer available.</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</div>
			</main>
		);
	}

	const organisationId = plan.organisation?.organisation_id ?? planId;
	const baseHref = `/subscription-plans/${planId}`;
	const navigation = [
		{ label: "Overview", href: baseHref },
		{ label: "Features", href: `${baseHref}/features` },
		{ label: "Models", href: `${baseHref}/models` },
	];

	return (
		<main className="flex flex-col">
			<EntityStickyHeader kind="subscription" id={organisationId} name={plan.name} observeId="subscription-detail-primary-header" baseHref={baseHref} navigation={navigation} />
			<div className="container mx-auto px-4 py-6 md:py-8">
				<div id="subscription-detail-primary-header" className="mb-6 flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex min-w-0 items-center gap-4">
							<div className="relative flex size-14 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card/40">
								<div className="relative size-10">
									<Logo
										id={
											plan.organisation
												?.organisation_id ?? planId
										}
										alt={
											plan.organisation?.name ?? plan.name
										}
										className="object-contain"
										fill
									/>
								</div>
							</div>
						<div className="min-w-0">
							<h1 className="truncate text-3xl font-bold tracking-tight">
								{plan.name}
							</h1>
							<Link
								href={`/organisations/${plan.organisation?.organisation_id}`}
							>
								<span className="mt-1.5 inline-flex text-sm font-medium text-muted-foreground underline decoration-transparent underline-offset-4 transition-colors hover:text-foreground hover:decoration-current">
									{plan.organisation?.name ??
										"Unknown Provider"}
								</span>
							</Link>
						</div>
					</div>

					<div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
						<RotatingPricing prices={plan.prices} />
						{tab !== "overview" ? <Button asChild variant="outline" size="sm" className="rounded-md"><Link href={baseHref}><PanelsTopLeft className="size-4" />Overview</Link></Button> : null}
						{tab !== "features" ? <Button asChild variant="outline" size="sm" className="rounded-md"><Link href={`${baseHref}/features`}><Sparkles className="size-4" />Features</Link></Button> : null}
						{tab !== "models" ? <Button asChild variant="outline" size="sm" className="rounded-md"><Link href={`${baseHref}/models`}><List className="size-4" />Models</Link></Button> : null}
					</div>
				</div>
				<div className="mt-6 min-h-full">{tocItems.length ? <div className="flex flex-col gap-6 lg:flex-row lg:items-start"><ModelPageToc items={tocItems} className="lg:h-full lg:w-40 lg:shrink-0 xl:w-44" /><div className="min-w-0 flex-1">{children}</div></div> : children}</div>
			</div>
		</main>
	);
}
