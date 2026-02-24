import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SubscriptionPlanSummary } from "@/lib/fetchers/subscription-plans/getAllSubscriptionPlans";
import { Logo } from "@/components/Logo";

type Props = {
	plan: SubscriptionPlanSummary;
};

export default function SubscriptionPlanCard({ plan }: Props) {
	const id = plan.plan_id;
	const name = plan.name;
	const providerName = plan.organisation?.name ?? "Unknown Provider";
	const providerId = plan.organisation_id;

	if (!providerId) {
		return null; // Skip plans without organisation
	}

	return (
		<Card
			style={{ borderColor: plan.organisation?.colour || undefined }}
			className={cn(
				"h-full flex flex-col shadow-lg relative dark:shadow-zinc-900/25 dark:bg-zinc-950 transition-transform transform hover:scale-105 duration-200 ease-in-out",
				plan.organisation?.colour && "border-2"
			)}
		>
			<CardContent className="flex flex-row items-center gap-3 pt-6">
				<Link
					href={`/organisations/${providerId}`}
					className="group shrink-0"
				>
					<div className="w-10 h-10 relative flex items-center justify-center rounded-xl border">
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
						className="group"
					>
						<Link
							href={`/subscription-plans/${id}`}
							aria-label={`Go to ${name} details`}
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
