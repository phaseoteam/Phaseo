import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { SubscriptionPlanSummary } from "@/lib/fetchers/subscription-plans/types";
import { Logo } from "@/components/Logo";
import type { SubscriptionPlansMessages } from "@/i18n/subscription-plans";

type Props = {
	plan: SubscriptionPlanSummary;
	messages: Pick<SubscriptionPlansMessages["detail"], "unknownProvider" | "goToDetails">;
};

export default function SubscriptionPlanCard({ plan, messages }: Props) {
	const id = plan.plan_id;
	const name = plan.name;
	const providerName = plan.organisation?.name ?? messages.unknownProvider;
	const providerId = plan.organisation_id;

	if (!providerId) {
		return null; // Skip plans without organisation
	}

	return (
		<Card
			className="h-full gap-0 rounded-md border-border/70 bg-card/30 py-0 shadow-none transition-colors hover:bg-muted/25"
		>
			<CardContent className="flex items-center gap-3 p-3">
				<Link
					href={`/organisations/${providerId}`}
					className="group shrink-0"
				>
					<div className="size-10 relative flex items-center justify-center rounded-md border border-border/70 bg-background">
						<div className="w-7 h-7 relative">
							<Logo
								id={providerId}
								alt={providerName}
								className="object-contain group-hover:opacity-80 transition"
								fill
							/>
						</div>
					</div>
				</Link>
				<div className="flex flex-col min-w-0 flex-1">
					<Link
						href={`/subscription-plans/${id}`}
						className="font-semibold truncate leading-tight"
					>
						<span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
							{name}
						</span>
					</Link>
					<Link
						href={`/organisations/${providerId}`}
						className="text-xs text-muted-foreground truncate flex items-center gap-1"
					>
						<span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
							{providerName}
						</span>
						{plan.description && (
							<span className="truncate ml-1">
								- {plan.description}
							</span>
						)}
					</Link>
				</div>
				<div className="ml-auto flex items-center gap-1">
					<Button
						asChild
						size="icon"
						variant="ghost"
						tabIndex={-1}
						className="group size-8 shrink-0 rounded-md"
					>
						<Link
							href={`/subscription-plans/${id}`}
							aria-label={messages.goToDetails.replace("{name}", name)}
							tabIndex={-1}
						>
							<ArrowRight className="w-5 h-5 transition-colors group-hover:text-primary" />
						</Link>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
