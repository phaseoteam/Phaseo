import type { SubscriptionPlanFeature } from "@/lib/fetchers/subscription-plans/types";
import type { SubscriptionPlansMessages } from "@/i18n/subscription-plans";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface SubscriptionPlanFeaturesTableProps {
	features?: SubscriptionPlanFeature[] | null;
	messages: Pick<SubscriptionPlansMessages["detail"], "feature" | "value" | "description">;
}

export default function SubscriptionPlanFeaturesTable({ features, messages }: SubscriptionPlanFeaturesTableProps) {
	if (!features?.length) return null;

	return (
		<div className="overflow-hidden rounded-md border border-border/70">
			<Table aria-label={messages.feature}>
				<TableHeader className="bg-muted/50">
					<TableRow>
						<TableHead scope="col" className="px-4">{messages.feature}</TableHead>
						<TableHead scope="col" className="px-4">{messages.value}</TableHead>
						<TableHead scope="col" className="px-4">{messages.description}</TableHead>
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
