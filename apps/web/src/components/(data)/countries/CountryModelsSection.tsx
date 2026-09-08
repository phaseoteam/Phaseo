"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ModelCard } from "@/components/(data)/models/Models/ModelCard";
import { Input } from "@/components/ui/input";
import type { ModelCard as ModelCardType } from "@/lib/fetchers/models/getAllModels";

type CountryModelsSectionProps = {
	models: ModelCardType[];
};

export default function CountryModelsSection({ models }: CountryModelsSectionProps) {
	const [query, setQuery] = useState("");
	const groups = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		const filtered = normalizedQuery
			? models.filter((model) =>
					[
						model.name,
						model.model_id,
						model.organisation_name,
						model.organisation_id,
					]
						.filter(Boolean)
						.join(" ")
						.toLowerCase()
						.includes(normalizedQuery),
				)
			: models;

		const byOrganisation = new Map<
			string,
			{ id: string; name: string; models: ModelCardType[] }
		>();
		for (const model of filtered) {
			const id = model.organisation_id || "unknown";
			const name = model.organisation_name || "Unknown Organisation";
			const group = byOrganisation.get(id) ?? { id, name, models: [] };
			group.models.push(model);
			byOrganisation.set(id, group);
		}

		return Array.from(byOrganisation.values())
			.map((group) => ({
				...group,
				models: [...group.models].sort(
					(a, b) => (b.primary_timestamp ?? 0) - (a.primary_timestamp ?? 0),
				),
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [models, query]);

	const visibleCount = groups.reduce((total, group) => total + group.models.length, 0);

	return (
		<div className="space-y-5">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="relative w-full sm:max-w-sm">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search models or organisations"
						aria-label="Search country models"
						className="h-9 rounded-md pl-9"
					/>
				</div>
				<p className="shrink-0 text-sm tabular-nums text-muted-foreground">
					{visibleCount.toLocaleString()} {visibleCount === 1 ? "model" : "models"}
				</p>
			</div>

			{groups.length ? (
				<div className="space-y-8">
					{groups.map((group) => (
						<section key={group.id} className="space-y-2">
							<div className="flex items-baseline justify-between gap-4 border-b border-border/70 pb-2">
								<h3 className="text-base font-semibold">{group.name}</h3>
								<span className="text-xs tabular-nums text-muted-foreground">
									{group.models.length} {group.models.length === 1 ? "model" : "models"}
								</span>
							</div>
							<div className="divide-y divide-border/70">
								{group.models.map((model) => (
									<ModelCard key={model.model_id} model={model} />
								))}
							</div>
						</section>
					))}
				</div>
			) : (
				<div className="border-y border-border/70 py-10 text-center text-sm text-muted-foreground">
					No models match your search.
				</div>
			)}
		</div>
	);
}
