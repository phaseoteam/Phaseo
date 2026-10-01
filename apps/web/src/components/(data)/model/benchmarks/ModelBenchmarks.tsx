import { Card } from "@/components/ui/card";
import { getTranslations } from "next-intl/server";
import type {
	ModelBenchmarkHighlight,
	ModelBenchmarkResult,
} from "@/lib/fetchers/models/getModelBenchmarkData";
import { ModelBenchmarksGrid } from "./ModelBenchmarksGrid";
import { ModelBenchmarksTable } from "./ModelBenchmarksTable";

type Props = {
	highlightCards: ModelBenchmarkHighlight[];
	benchmarkTableData?: Record<string, ModelBenchmarkResult[]>;
	mode?: "summary" | "full";
};

export default async function ModelBenchmarks({
	highlightCards,
	benchmarkTableData,
	mode = "full",
}: Props) {
	const t = await getTranslations("Catalogue.models.detail.benchmarkGrid");
	const showFull = mode === "full";

	return (
		<div className="space-y-8">
			<section className="space-y-3">
				{highlightCards.length ? (
					<ModelBenchmarksGrid highlights={highlightCards} />
				) : (
					<Card className="border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
						{t("noHighlights")}
					</Card>
				)}
			</section>

			{showFull ? (
				<>
					<section className="space-y-3">
						<div>
							<h2 className="text-xl font-semibold">{t("tableTitle")}</h2>
						</div>
						<ModelBenchmarksTable grouped={benchmarkTableData ?? {}} />
					</section>
				</>
			) : null}
		</div>
	);
}
