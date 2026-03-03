import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ExtendedModel, Price, APIProvider } from "@/data/types";

interface ModelPriceCardProps {
	model: ExtendedModel;
}

export default function ModelPriceCard({ model }: ModelPriceCardProps) {
	// Defensive: if no prices, show nothing
	if (!model.prices || model.prices.length === 0) return null;

	// Sort prices by blended price ascending
	const sortedPrices = [...model.prices].sort((a, b) => {
		const inputA =
			a.input_token_price !== null && a.input_token_price !== undefined
				? Number(a.input_token_price)
				: 0;
		const outputA =
			a.output_token_price !== null && a.output_token_price !== undefined
				? Number(a.output_token_price)
				: 0;
		const blendedA = inputA + outputA;
		const inputB =
			b.input_token_price !== null && b.input_token_price !== undefined
				? Number(b.input_token_price)
				: 0;
		const outputB =
			b.output_token_price !== null && b.output_token_price !== undefined
				? Number(b.output_token_price)
				: 0;
		const blendedB = inputB + outputB;
		return blendedA - blendedB;
	});

	return (
		<>
			{sortedPrices.map((price: Price, idx: number) => {
				const apiProviderObj =
					typeof price.api_provider === "string"
						? undefined
						: (price.api_provider as APIProvider | undefined);
				const apiProviderId =
					apiProviderObj?.api_provider_id ??
					(typeof price.api_provider === "string"
						? price.api_provider
						: "unknown");
				const apiProviderName =
					apiProviderObj?.api_provider_name ?? apiProviderId;

				// Parse prices
				const inputPrice =
					price.input_token_price !== null &&
					price.input_token_price !== undefined
						? Number(price.input_token_price)
						: null;
				const outputPrice =
					price.output_token_price !== null &&
					price.output_token_price !== undefined
						? Number(price.output_token_price)
						: null;
				// Blended price (3:1 ratio: 75% input, 25% output)
				const blendedPrice =
					inputPrice !== null && outputPrice !== null
						? (inputPrice * 0.75 + outputPrice * 0.25) * 1_000_000
						: null;
				// Throughput and latency
				const throughput =
					price.throughput && price.throughput !== ""
						? price.throughput
						: null;
				const latency =
					price.latency && price.latency !== ""
						? price.latency
						: null;

				// Small helpers
				function Stat({
					label,
					value,
					tooltip,
					accent = "",
				}: {
					label: string;
					value: string;
					tooltip?: string;
					accent?: string;
				}) {
					return (
						<Card
							className={`flex flex-col items-center justify-center rounded-lg border border-zinc-200/70 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-3 ${accent}`}
						>
							<span className="text-xl font-semibold tabular-nums tracking-tight">
								{value}
							</span>
							<span
								className="text-[11px] uppercase tracking-wide text-zinc-600 dark:text-zinc-400 mt-1"
								title={tooltip}
							>
								{label}
							</span>
						</Card>
					);
				}

				const Money = (n: number | null, suffix = "/1M") =>
					n === null || isNaN(n)
						? "N/A"
						: `$${n.toFixed(2)}${suffix}`;

				return (
					<Card
						key={idx}
						className="group shadow-xs border hover:shadow-lg transition-all duration-200 flex flex-col h-full dark:shadow-zinc-900/25 dark:bg-zinc-950/90 dark:border-zinc-800 mb-4 overflow-hidden"
					>
						<CardHeader className="pb-3 pt-4 px-4 sm:px-5 bg-linear-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-950/60 border-b border-zinc-200/70 dark:border-zinc-800">
							<CardTitle className="text-base sm:text-lg flex items-center justify-between gap-3">
								<div className="flex items-center gap-2.5 min-w-0">
									<img
										src={`/providers/${apiProviderId}.svg`}
										alt={apiProviderName}
										width={28}
										height={28}
										className="w-7 h-7 rounded shrink-0"
									/>
									<Link
										href={`prices/${apiProviderId}`}
										className="group/provider flex items-center gap-1 truncate font-semibold capitalize focus:outline-hidden"
									>
										<span className="truncate font-semibold relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
											{apiProviderName}
										</span>
										<ArrowUpRight
											size={18}
											className="ml-0.5 opacity-0 group-hover/provider:opacity-100 transition-opacity"
											aria-label="Open provider link"
										/>
									</Link>
								</div>
							</CardTitle>
						</CardHeader>

						<CardContent className="flex flex-col gap-4 p-4 sm:p-5">
							{/* Pricing stats */}
							<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
								<Stat
									label="Input Price"
									value={Money(
										inputPrice !== null
											? inputPrice * 1_000_000
											: null
									)}
									tooltip="Price per 1M input tokens"
									accent="border-b-2 border-b-blue-500 dark:border-b-blue-400"
								/>
								<Stat
									label="Output Price"
									value={Money(
										outputPrice !== null
											? outputPrice * 1_000_000
											: null
									)}
									tooltip="Price per 1M output tokens"
									accent="border-b-2 border-b-green-500 dark:border-b-green-400"
								/>
								<Stat
									label="Blended Price"
									value={Money(blendedPrice)}
									tooltip="Blended price (3:1) is the average cost per 1M tokens assuming 75% are input tokens and 25% are output, reflecting typical usage patterns."
									accent="border-b-2 border-b-orange-500 dark:border-b-orange-400"
								/>
							</div>

							{/* Secondary stats */}
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
								<div className="flex items-center justify-between rounded-lg bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/70 dark:border-zinc-800 px-3 py-2.5">
									<span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
										Throughput
									</span>
									<span className="text-sm tabular-nums font-semibold">
										{throughput !== null &&
										throughput !== undefined &&
										throughput !== ""
											? throughput.toString()
											: "-"}
									</span>
								</div>
								<div className="flex items-center justify-between rounded-lg bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/70 dark:border-zinc-800 px-3 py-2.5">
									<span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
										Latency
									</span>
									<span className="text-sm tabular-nums font-semibold">
										{latency !== null &&
										latency !== undefined &&
										latency !== ""
											? `${latency} ms`
											: "-"}
									</span>
								</div>
							</div>
						</CardContent>
					</Card>
				);
			})}
		</>
	);
}
