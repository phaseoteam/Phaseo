import { ExtendedModel } from "@/data/types";
import {
	Card,
	CardHeader,
	CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ContextWindowBarChart from "./ContextWindowBarChart";
import React from "react";
import { Info } from "lucide-react";
import Link from "next/link";
import { ProviderLogoName } from "../../ProviderLogoName";

interface ContextWindowComparisonProps {
	selectedModels: ExtendedModel[];
}

function getBarChartData(models: ExtendedModel[]) {
	return [
		{
			type: "Input Context",
			...Object.fromEntries(
				models.map((m) => [
					m.name,
					m.input_context_length != null
						? m.input_context_length
						: null,
				])
			),
		},
		{
			type: "Output Context",
			...Object.fromEntries(
				models.map((m) => [
					m.name,
					m.output_context_length != null
						? m.output_context_length
						: null,
				])
			),
		},
	];
}

function getInfoSentence(models: ExtendedModel[]) {
	if (models.length < 2) return null;
	// Sort by input context length descending
	const sorted = [...models].sort(
		(a, b) => (b.input_context_length || 0) - (a.input_context_length || 0)
	);
	const [first, second] = sorted;
	return (
		<>
			<Link
				href={`/models/${encodeURIComponent(first.id)}`}
				className="group"
			>
				<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full font-semibold">
					{first.name}
				</span>
			</Link>{" "}
			accepts {first.input_context_length?.toLocaleString() ?? "-"} input
			tokens compared to{" "}
			<Link
				href={`/models/${encodeURIComponent(second.id)}`}
				className="group"
			>
				<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full font-semibold">
					{second.name}
				</span>
			</Link>
			&apos;s {second.input_context_length?.toLocaleString() ?? "-"}.{" "}
			<Link
				href={`/models/${encodeURIComponent(first.id)}`}
				className="group"
			>
				<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full font-semibold">
					{first.name}
				</span>
			</Link>{" "}
			can generate responses up to{" "}
			{first.output_context_length?.toLocaleString() ?? "-"} tokens, while{" "}
			<Link
				href={`/models/${encodeURIComponent(second.id)}`}
				className="group"
			>
				<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full font-semibold">
					{second.name}
				</span>
			</Link>{" "}
			is limited to{" "}
			{second.output_context_length?.toLocaleString() ?? "-"} tokens.
		</>
	);
}

function BarChartTooltip({ active, payload, label }: any) {
	if (!active || !payload || payload.length === 0) return null;
	return (
		<div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-3 border border-zinc-200 dark:border-zinc-800 min-w-[225px]">
			<div className="font-semibold text-sm mb-1">{label}</div>
			{payload.map((p: any) => (
				<div key={p.name} className="flex justify-between text-xs mb-1">
					<span>{p.name}</span>
					<span>
						{p.value != null ? p.value.toLocaleString() : "-"}{" "}
						tokens
					</span>
				</div>
			))}
		</div>
	);
}

function getModelCountBadge(models: ExtendedModel[]) {
	const withInfo = models.filter(
		(m) => m.input_context_length != null && m.output_context_length != null
	);
	if (withInfo.length === models.length) {
		return <Badge variant="outline" className="text-xs">All models have context</Badge>;
	}
	if (withInfo.length === 1) {
		return (
			<Badge variant="outline" className="text-xs">1 model has context</Badge>
		);
	}
	if (withInfo.length === 0) {
		return (
			<Badge variant="outline" className="text-xs">
				No context data
			</Badge>
		);
	}
	return (
		<Badge variant="outline" className="text-xs">
			{models.length - withInfo.length} missing
		</Badge>
	);
}

export default function ContextWindowComparison({
	selectedModels,
}: ContextWindowComparisonProps) {
	if (!selectedModels || selectedModels.length === 0) return null;

	const anyContext = selectedModels.some(
		(m) => m.input_context_length != null || m.output_context_length != null
	);
	if (!anyContext) return null;

	const infoSentence = getInfoSentence(selectedModels);
	return (
		<section className="space-y-3">
			<header className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">Context window</h2>
					<p className="text-sm text-muted-foreground">
						Maximum input and output token capacity.
					</p>
				</div>
				{getModelCountBadge(selectedModels)}
			</header>

			<div className="space-y-4">
				{infoSentence && (
					<Card className="border-border/60 bg-background/60 shadow-sm">
						<CardContent className="py-4 text-sm text-left flex items-center justify-start">
							<span className="relative flex h-4 w-4 items-center justify-center mr-4 shrink-0">
								<span className="absolute h-6 w-6 rounded-full bg-blue-400/30" />
								<Info className="relative h-full w-full text-blue-500 shrink-0" />
							</span>
							<span>{infoSentence}</span>
						</CardContent>
					</Card>
				)}
				<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 w-full gap-4 mb-6">
					{selectedModels.map((model) => (
						<Card
							key={model.id}
							className="shadow border-none flex flex-col justify-between min-w-0"
						>
							<CardHeader className="flex flex-row items-center gap-3 pb-2">
								<ProviderLogoName
									id={model.provider.provider_id}
									name={model.provider.name}
									href={`/organisations/${model.provider.provider_id}`}
									size="sm"
									mobilePopover
								/>
								<div className="font-semibold truncate text-base leading-tight">
									<Link
										href={`/models/${encodeURIComponent(
											model.id
										)}`}
										className="group"
									>
										<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full">
											{model.name}
										</span>
									</Link>
								</div>
							</CardHeader>
							<CardContent className="pt-0">
								<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm mb-1">
									<span className="text-muted-foreground">
										Input Context Length
									</span>
									<span className="font-mono font-bold mt-1 sm:mt-0">
										{model.input_context_length != null
											? formatTokens(
													model.input_context_length
											  )
											: "-"}
									</span>
								</div>
								<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm">
									<span className="text-muted-foreground">
										Output Context Length
									</span>
									<span className="font-mono font-bold mt-1 sm:mt-0">
										{model.output_context_length != null
											? formatTokens(
													model.output_context_length
											  )
											: "-"}
									</span>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
				<div className="hidden sm:block rounded-xl border border-border/60 bg-background/60 p-4 text-center mb-4">
					<ContextWindowBarChart
						chartData={getBarChartData(selectedModels)}
						models={selectedModels.map((m) => ({
							name: m.name,
							provider: m.provider.name,
						}))}
						CustomTooltip={BarChartTooltip}
						barGap={32}
					/>
				</div>
			</div>
		</section>
	);
}

// Helper for K/M/B formatting
function formatTokens(val: number | null | undefined): string {
	if (val == null) return "-";
	if (val >= 1_000_000_000)
		return (val / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
	if (val >= 1_000_000)
		return (val / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
	if (val >= 1_000) return (val / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
	return val.toLocaleString();
}
