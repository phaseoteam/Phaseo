import { ReactNode } from "react";
import Link from "next/link";
import { getSubscriptionPlanCached } from "@/lib/fetchers/subscription-plans/getSubscriptionPlan";
import SubscriptionPlanTabs from "@/components/(data)/subscription-plans/SubscriptionPlanTabs";
import { Logo } from "@/components/Logo";
import RotatingPricing from "@/components/(data)/subscription-plans/RotatingPricing";

interface SubscriptionPlanDetailShellProps {
	planId: string;
	children: ReactNode;
}

export default async function SubscriptionPlanDetailShell({
	planId,
	children,
}: SubscriptionPlanDetailShellProps) {
	const plan = await getSubscriptionPlanCached(planId, false);

	if (!plan) {
		return (
			<main className="flex min-h-screen flex-col">
				<div className="container mx-auto px-4 py-8">
					<div className="rounded-lg border border-dashed p-6 md:p-8 text-center bg-muted/30">
						<div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
							<span className="text-xl">💰</span>
						</div>
						<p className="text-base font-medium">
							Subscription plan not found
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							This subscription plan may have been removed or is
							no longer available.
						</p>
					</div>
				</div>
			</main>
		);
	}

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8">
				<div className="mb-8 flex w-full flex-col items-center justify-between gap-2 md:flex-row md:items-start md:gap-0">
					<div className="flex flex-col items-center gap-4 md:flex-row">
						<div className="flex items-center justify-center">
							<div className="relative flex h-12 w-12 items-center justify-center rounded-xl border md:h-24 md:w-24">
								<div className="relative h-10 w-10 md:h-20 md:w-20">
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
						</div>
						<div className="flex flex-col items-center justify-center md:items-start">
							<h1 className="mb-1 text-center text-3xl font-bold md:text-left md:text-5xl">
								{plan.name}
							</h1>
							<Link
								href={`/organisations/${plan.organisation?.organisation_id}`}
							>
								<h2 className="mb-1 text-center text-md font-semibold md:text-left md:text-xl relative after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
									{plan.organisation?.name ??
										"Unknown Provider"}
								</h2>
							</Link>
						</div>
					</div>

					<div className="mt-2 flex h-full items-center justify-center md:mt-0 md:ml-6 md:self-center">
						<RotatingPricing prices={plan.prices} />
					</div>
				</div>

				<SubscriptionPlanTabs planId={planId} />

				<div className="mt-6">{children}</div>
			</div>
		</main>
	);
}
