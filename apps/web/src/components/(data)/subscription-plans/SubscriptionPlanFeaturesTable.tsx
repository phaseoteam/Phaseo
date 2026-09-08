import type { SubscriptionPlanFeature } from "@/lib/fetchers/subscription-plans/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface SubscriptionPlanFeaturesTableProps {
	features?: SubscriptionPlanFeature[] | null;
}

export default function SubscriptionPlanFeaturesTable({ features }: SubscriptionPlanFeaturesTableProps) {
	if (!features?.length) return null;

	return (
		<div className="overflow-hidden rounded-md border border-border/70">
			<Table aria-label="Subscription plan features">
				<TableHeader className="bg-muted/50">
					<TableRow>
						<TableHead scope="col" className="px-4">Feature</TableHead>
						<TableHead scope="col" className="px-4">Value</TableHead>
						<TableHead scope="col" className="px-4">Description</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{features.map((feature) => (
						<TableRow key={feature.feature_name}>
							<TableCell className="px-4 py-3 font-medium">{feature.feature_name}</TableCell>
							<TableCell className="px-4 py-3">{feature.feature_value || "-"}</TableCell>
							<TableCell className="min-w-48 px-4 py-3 text-muted-foreground">{feature.feature_description || "-"}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
