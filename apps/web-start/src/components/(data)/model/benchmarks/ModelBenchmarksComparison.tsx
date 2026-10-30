import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import type { BenchmarkComparisonChart } from "@/lib/fetchers/models/getModelBenchmarkData";
import { ModelBenchmarksComparisonGrid } from "./ModelBenchmarksComparisonGrid";

interface ModelBenchmarksComparisonProps {
	comparisons: BenchmarkComparisonChart[];
}

export default function ModelBenchmarksComparison({
	comparisons,
}: ModelBenchmarksComparisonProps) {
	const tUi = useTranslations("Common.ui");

	if (!comparisons.length) {
		return (
			<Card className="border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
				{tUi("benchmarkComparison.noComparisonData")}
			</Card>
		);
	}

	return (
		<section className="mt-12 space-y-4">
			<div>
				<h3 className="text-lg font-medium">
					{tUi("benchmarkComparison.comparisonHeading")}
				</h3>
				<p className="text-sm text-muted-foreground">
					{tUi("benchmarkComparison.description")}
				</p>
			</div>
			<ModelBenchmarksComparisonGrid comparisons={comparisons} />
		</section>
	);
}
