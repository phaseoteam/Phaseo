"use client";

import { useMemo } from "react";
import { useQueryState } from "nuqs";
import SubscriptionPlanCard from "./SubscriptionPlanCard";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import type { SubscriptionPlanSummary } from "@/lib/fetchers/subscription-plans/getAllSubscriptionPlans";

interface SubscriptionPlansDisplayProps {
	plans: SubscriptionPlanSummary[];
}

export default function SubscriptionPlansDisplay({
	plans,
}: SubscriptionPlansDisplayProps) {
	// State for filters
	const [search, setSearch] = useQueryState("search", {
		defaultValue: "",
	});

	// Filtering and sorting logic
	const filteredPlans = useMemo(() => {
		let filtered = plans;

		// Search filter
		if (search.trim()) {
			const q = search.trim().toLowerCase();
			filtered = filtered.filter(
				(p) =>
					p.name.toLowerCase().includes(q) ||
					p.organisation?.name?.toLowerCase().includes(q) ||
					p.description?.toLowerCase().includes(q)
			);
		}

		// Sorting by organization name, then plan name
		filtered = [...filtered].sort((a, b) => {
			const orgA = a.organisation?.name ?? "";
			const orgB = b.organisation?.name ?? "";
			const organisationCompare = orgA.localeCompare(orgB);
			if (organisationCompare !== 0) return organisationCompare;
			return a.name.localeCompare(b.name);
		});

		return filtered;
	}, [plans, search]);

	return (
		<>
			{/* Title and Search Bar Row */}
			<div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
				<h1 className="font-bold text-xl mb-2 md:mb-0">
					Subscription Plans
				</h1>
				<div className="flex-1 flex justify-end">
					<div className="relative w-full max-w-xs">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search plans..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="pl-9 pr-2 py-1.5 text-sm rounded-full bg-background border focus:outline-hidden focus:ring-2 focus:ring-primary w-full"
							style={{ minWidth: 0 }}
						/>
					</div>
				</div>
			</div>

			{/* Subscription Plans Grid */}
			<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-4">
				{filteredPlans.length > 0 ? (
					filteredPlans.map((plan) => (
						<SubscriptionPlanCard
							key={plan.plan_uuid}
							plan={plan}
						/>
					))
				) : (
					<div className="col-span-full text-center text-muted-foreground py-12">
						No subscription plans found for the selected filters.
					</div>
				)}
			</div>
		</>
	);
}
