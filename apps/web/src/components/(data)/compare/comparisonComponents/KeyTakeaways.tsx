import type { ExtendedModel } from "@/data/types";
import { ProviderLogo } from "../ProviderLogo";

interface KeyTakeawaysProps {
	selectedModels: ExtendedModel[];
}

// Helper functions to get prices
function getModelPrices(model: ExtendedModel) {
	if (!model.prices || model.prices.length === 0) return null;
	// For now, just use the first pricing entry
	return model.prices[0];
}

function getInputPrice(model: ExtendedModel): number | null {
	const prices = getModelPrices(model);
	return prices?.input_token_price ?? null;
}

function getOutputPrice(model: ExtendedModel): number | null {
	const prices = getModelPrices(model);
	return prices?.output_token_price ?? null;
}

function getKeyPoints(model: ExtendedModel, allModels: ExtendedModel[]) {
	const points: string[] = [];
	// Context window
	if (model.input_context_length && model.input_context_length >= 128000) {
		points.push(
			`Very large input context window (${model.input_context_length.toLocaleString()} tokens)`
		);
	} else if (model.input_context_length) {
		points.push(
			`Input context: ${model.input_context_length.toLocaleString()} tokens`
		);
	}
	// Pricing
	const inputPrice = getInputPrice(model);
	if (inputPrice != null) {
		const minInput = Math.min(
			...allModels
				.map((m) => getInputPrice(m))
				.filter((p): p is number => p !== null)
		);
		if (inputPrice === minInput) {
			points.push("Lowest input token price");
		}
	}
	const outputPrice = getOutputPrice(model);
	if (outputPrice != null) {
		const minOutput = Math.min(
			...allModels
				.map((m) => getOutputPrice(m))
				.filter((p): p is number => p !== null)
		);
		if (outputPrice === minOutput) {
			points.push("Lowest output token price");
		}
	}
	// Benchmarks
	if (model.benchmark_results && model.benchmark_results.length > 0) {
		// Find best scores for this model
		const bests = model.benchmark_results.filter((b) => {
			const score = parseFloat(b.score.toString().replace("%", ""));
			return allModels.every((m) => {
				if (m.id === model.id) return true;
				const other = m.benchmark_results?.find(
					(x) => x.benchmark.name === b.benchmark.name
				);
				if (!other) return true;
				const otherScore = parseFloat(
					other.score.toString().replace("%", "")
				);
				return score >= otherScore;
			});
		});
		bests.forEach((b) =>
			points.push(`Highest ${b.benchmark.name} score (${b.score})`)
		);
	}
	// Knowledge cutoff
	if (model.knowledge_cutoff) {
		const maxCutoff = allModels.reduce((max, m) => {
			if (!m.knowledge_cutoff) return max;
			return new Date(m.knowledge_cutoff) > new Date(max)
				? m.knowledge_cutoff
				: max;
		}, model.knowledge_cutoff);
		if (model.knowledge_cutoff === maxCutoff) {
			points.push(
				`Most recent knowledge cutoff (${model.knowledge_cutoff})`
			);
		}
	}
	return points;
}

export default function KeyTakeaways({ selectedModels }: KeyTakeawaysProps) {
	if (!selectedModels || selectedModels.length === 0) return null;
	return (
		<div className="mb-6">
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				{selectedModels.map((model) => (
					<div
						key={model.id}
						className="bg-muted rounded-lg shadow p-4 flex flex-col gap-2"
					>
						<div className="flex items-center gap-3 mb-2">
							<ProviderLogo
								id={model.provider.provider_id}
								alt={model.provider.name}
								size="sm"
							/>
							<div>
								<div className="font-bold text-lg leading-tight">
									{model.name}
								</div>
								<div className="text-sm text-muted-foreground">
									{model.provider.name}
								</div>
							</div>
						</div>
						<ul className="list-disc pl-5 text-left text-base">
							{getKeyPoints(model, selectedModels).map(
								(point, i) => (
									<li key={i}>{point}</li>
								)
							)}
						</ul>
					</div>
				))}
			</div>
		</div>
	);
}
