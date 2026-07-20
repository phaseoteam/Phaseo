import type { SubscriptionPlanFeature } from "@/lib/fetchers/subscription-plans/types";

interface SubscriptionPlanFeaturesTableProps {
	features?: SubscriptionPlanFeature[] | null;
}

export default function SubscriptionPlanFeaturesTable({ features }: SubscriptionPlanFeaturesTableProps) {
	if (!features || features.length === 0) {
		return null;
	}

	return (
		<div className="w-full">
			<div className="overflow-x-auto">
				<table className="w-full border-collapse border border-gray-200 dark:border-gray-700 rounded-lg">
					<thead>
						<tr className="bg-muted/50">
							<th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left font-semibold">
								Feature
							</th>
							<th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left font-semibold">
								Value
							</th>
							<th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left font-semibold">
								Description
							</th>
						</tr>
					</thead>
					<tbody>
						{features.map((feature, index) => (
							<tr
								key={feature.feature_name}
								className={index % 2 === 0 ? "bg-background" : "bg-muted/20"}
							>
								<td className="border border-gray-200 dark:border-gray-700 px-4 py-3 font-medium">
									{feature.feature_name}
								</td>
								<td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
									{feature.feature_value || "-"}
								</td>
								<td className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-muted-foreground">
									{feature.feature_description || "-"}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
