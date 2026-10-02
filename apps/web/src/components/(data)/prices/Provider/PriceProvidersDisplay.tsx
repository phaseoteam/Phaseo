"use client";

import { useMemo } from "react";
import { useQueryState } from "nuqs";
import PriceProviderCard from "./PriceProviderCard";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

interface PriceProvider {
	id: string;
	name: string;
	description?: string;
	minInputPrice?: number | null;
	minOutputPrice?: number | null;
}

interface PriceProvidersDisplayProps {
	providers: PriceProvider[];
}

export default function PriceProvidersDisplay({
	providers,
}: PriceProvidersDisplayProps) {
	const t = useTranslations("Common.search");

	// State for filters
	const [search, setSearch] = useQueryState("search", {
		defaultValue: "",
	});

	// Filtering and sorting logic
	const filteredProviders = useMemo(() => {
		let filtered = providers;

		// Search filter
		if (search.trim()) {
			const q = search.trim().toLowerCase();
			filtered = filtered.filter(
				(p) =>
					p.name.toLowerCase().includes(q) ||
					(p.description && p.description.toLowerCase().includes(q))
			);
		}

		// Sorting
		filtered = [...filtered].sort((a, b) => {
			return a.name.localeCompare(b.name);
		});

		return filtered;
	}, [providers, search]);

	return (
		<>
			{/* Title and Search Bar Row */}
			<div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
				<h1 className="font-bold text-xl text-black mb-2 md:mb-0">
					{t("apiProviders")}
				</h1>
				<div className="flex-1 flex justify-end">
					<div className="relative w-full max-w-xs">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder={t("apiProvidersPlaceholder")}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="pl-9 pr-2 py-1.5 text-sm rounded-full bg-background border focus:outline-hidden focus:ring-2 focus:ring-primary w-full"
							style={{ minWidth: 0 }}
						/>
					</div>
				</div>
			</div>

			{/* Providers Grid */}
			<div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
				{filteredProviders.length > 0 ? (
					filteredProviders.map((provider) => (
						<PriceProviderCard
							key={provider.id}
							id={provider.id}
							name={provider.name}
							description={provider.description || ""}
						/>
					))
				) : (
					<div className="col-span-full text-center text-muted-foreground py-12">
						{t("noApiProvidersFound")}
					</div>
				)}
			</div>
		</>
	);
}
