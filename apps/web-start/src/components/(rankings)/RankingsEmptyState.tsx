import { Card } from "@/components/ui/card";

type RankingsEmptyStateProps = {
	title: string;
	description: string;
};

export function RankingsEmptyState({
	title,
	description,
}: RankingsEmptyStateProps) {
	return (
		<Card className="p-6 text-center">
			<div className="text-sm font-medium">{title}</div>
			{description ? (
				<p className="text-sm text-muted-foreground mt-2">
					{description}
				</p>
			) : null}
		</Card>
	);
}
