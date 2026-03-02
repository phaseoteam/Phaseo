import React from "react";
import { ModelCard } from "@/components/(data)/models/Models/ModelCard";
import { ModelCard as ModelCardType } from "@/lib/fetchers/models/getAllModels";

interface ModelsGridProps {
	filteredModels: ModelCardType[];
}

type Group = {
	key: string; // YYYY-MM
	label: string; // e.g. "October 2025"
	date: number; // timestamp of group start month
	models: ModelCardType[];
};

function createGroupEntry(key: string): Group | null {
	const [yearStr, monthStr] = key.split("-");
	const year = Number(yearStr);
	const month = Number(monthStr);
	if (
		Number.isNaN(year) ||
		Number.isNaN(month) ||
		month < 1 ||
		month > 12
	) {
		return null;
	}
	const groupDate = new Date(year, month - 1, 1);
	return {
		key,
		label: groupDate.toLocaleString(undefined, {
			month: "long",
			year: "numeric",
		}),
		date: groupDate.getTime(),
		models: [],
	};
}

function ModelsGridImpl({ filteredModels }: ModelsGridProps) {
	const groupsMap = new Map<string, Group>();
	const unknownModels: ModelCardType[] = [];

	filteredModels.forEach((model) => {
		const groupKey = model.primary_group_key;
		if (!groupKey) {
			unknownModels.push(model);
			return;
		}

		if (!groupsMap.has(groupKey)) {
			const groupEntry = createGroupEntry(groupKey);
			if (!groupEntry) {
				unknownModels.push(model);
				return;
			}
			groupsMap.set(groupKey, groupEntry);
		}
		groupsMap.get(groupKey)!.models.push(model);
	});

	// Convert groups to array and sort by date desc (newest month first)
	const sortedGroups = Array.from(groupsMap.values()).sort(
		(a, b) => b.date - a.date
	);

	const getTimestamp = (model: ModelCardType) => model.primary_timestamp ?? 0;

	if (filteredModels.length === 0) {
		return (
			<div className="col-span-full text-center text-muted-foreground py-12">
				No models found for the selected filters.
			</div>
		);
	}

	return (
		<div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
			{/* Show other models grouped by month, with Unknown at the bottom */}
			{sortedGroups.map((group) => (
				<React.Fragment key={group.key}>
					{/* Group header */}
					<div
						key={group.key}
						className="col-span-full flex items-center my-2"
					>
						<div className="flex-grow border-t border-dashed border-muted-foreground opacity-50"></div>
						<span className="mx-4 text-xs text-muted-foreground tracking-wider font-semibold">
							{group.label}
						</span>
						<div className="flex-grow border-t border-dashed border-muted-foreground opacity-50"></div>
					</div>
					{group.models
						.sort((a, b) => getTimestamp(b) - getTimestamp(a))
						.map((model) => (
							<ModelCard key={model.model_id} model={model} />
						))}
				</React.Fragment>
			))}

			{unknownModels.length > 0 && (
				<>
					<div className="col-span-full flex items-center my-2">
						<div className="flex-grow border-t border-dashed border-muted-foreground opacity-50"></div>
						<span className="mx-4 text-xs text-muted-foreground tracking-wider font-semibold">
							Unknown
						</span>
						<div className="flex-grow border-t border-dashed border-muted-foreground opacity-50"></div>
					</div>
					{unknownModels.map((model) => (
						<ModelCard key={model.model_id} model={model} />
					))}
				</>
			)}
		</div>
	);
}

export const ModelsGrid = React.memo(ModelsGridImpl);
