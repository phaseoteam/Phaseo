import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { JsonLdScript } from "@/components/seo/JsonLdScript";
import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";
import type {
	PricingRule,
	ProviderPricing,
} from "@/lib/fetchers/models/getModelPricing";
import { formatModelLifecycleDate } from "@/lib/dates/modelLifecycleDates";
import { markdownToPlainText } from "@/lib/models/modelDescription";
import { PRICING_METER_OPTIONS } from "@/lib/pricing/meters";
import { modelMarkdownComponents } from "../modelMarkdown";
import type { ModelLineageLinks } from "./modelOverviewMetadata";
import ModelFaqAccordion from "./ModelFaqAccordion";

function parseTypes(value: string | null | undefined): string[] {
	if (!value) return [];
	return Array.from(
		new Set(
			value
				.split(",")
				.map((item) => item.trim().replace(/[_-]+/g, " "))
				.filter(Boolean),
		),
	);
}

function joinNaturalList(values: string[]): string {
	if (values.length === 0) return "";
	if (values.length === 1) return values[0]!;
	if (values.length === 2) return `${values[0]} and ${values[1]}`;
	return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

const MAX_FAQ_PROVIDER_NAMES = 8;

function getFaqProviders(pricing: ProviderPricing[]) {
	const providersById = new Map<string, { id: string; name: string }>();
	for (const entry of pricing) {
		const id = entry.provider.api_provider_id.trim();
		const name = entry.provider.api_provider_name.trim();
		if (id && name && !providersById.has(id)) {
			providersById.set(id, { id, name });
		}
	}
	const providers = Array.from(providersById.values()).sort((left, right) =>
		left.name.localeCompare(right.name),
	);
	return {
		visible: providers.slice(0, MAX_FAQ_PROVIDER_NAMES),
		remainingCount: Math.max(providers.length - MAX_FAQ_PROVIDER_NAMES, 0),
	};
}

function getNumericDetail(
	model: ModelOverviewPage,
	...keys: string[]
): number | null {
	for (const key of keys) {
		const detail = model.model_details.find(
			(item) => item.detail_name.trim().toLowerCase() === key,
		);
		const value = Number(detail?.detail_value);
		if (Number.isFinite(value) && value > 0) return value;
	}
	return null;
}

type CapabilitySupport = "supported" | "unsupported" | "unknown";

function getCapabilitySupport(
	metadata: ModelGatewayMetadata | null | undefined,
	paramIds: string[],
): CapabilitySupport {
	if (!metadata) return "unknown";
	const requested = new Set(paramIds);
	const matchingRows = Object.values(metadata.supportedParametersByEndpoint)
		.flat()
		.filter((row) => requested.has(row.param_id));
	if (matchingRows.length === 0) return "unknown";
	return matchingRows.some((row) => row.provider_count_supported > 0)
		? "supported"
		: "unsupported";
}

function capabilityAnswer(args: {
	modelName: string;
	label: string;
	support: CapabilitySupport;
	isGatewayActive: boolean;
}) {
	if (!args.isGatewayActive) {
		return `${args.modelName} is not currently active in the Phaseo Gateway, so ${args.label} is not available through the API.`;
	}
	if (args.support === "supported") {
		return `Yes. At least one active provider route for ${args.modelName} currently advertises ${args.label} support. Provider support can vary, so requests are routed only to compatible routes.`;
	}
	if (args.support === "unsupported") {
		return `No active provider route for ${args.modelName} currently advertises ${args.label} support.`;
	}
	return `Phaseo does not currently have enough active route metadata to confirm whether ${args.modelName} supports ${args.label}.`;
}

function getStatusDescription(status: ModelOverviewPage["status"]): string {
	switch (status) {
		case "Rumoured":
			return "a rumoured AI model";
		case "Announced":
			return "an announced AI model";
		case "Preview":
			return "a preview AI model";
		case "Limited Access":
			return "a limited-access AI model";
		case "Withheld":
			return "a withheld AI model";
		case "Deprecated":
			return "a deprecated AI model";
		case "Retired":
			return "a retired AI model";
		default:
			return "an AI model";
	}
}

function ensureSentencePunctuation(value: string): string {
	const trimmed = value.trim();
	return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function descriptionStartsWithModelName(
	description: string,
	modelName: string,
): boolean {
	const normalizedDescription = description.toLocaleLowerCase();
	const normalizedModelName = modelName.trim().toLocaleLowerCase();
	return Boolean(
		normalizedModelName && normalizedDescription.startsWith(normalizedModelName),
	);
}

type PricingHighlight = {
	key: string;
	label: string;
	formattedPrice: string;
};

function isNonNull<T>(value: T | null): value is T {
	return value !== null;
}

const PRICING_METER_LABELS: ReadonlyMap<string, string> = new Map(
	PRICING_METER_OPTIONS.map((option) => [option.value, option.label]),
);

const PRICING_METER_PRIORITY = [
	"input_text_tokens",
	"input_tokens",
	"output_text_tokens",
	"output_tokens",
	"output_reasoning_tokens",
	"input_image_tokens",
	"output_image_tokens",
	"input_image",
	"output_image",
	"input_audio_tokens",
	"output_audio_tokens",
	"input_audio_seconds",
	"input_audio_minutes",
	"output_audio_seconds",
	"output_audio_minutes",
	"audio_seconds",
	"audio_minutes",
	"input_video_tokens",
	"output_video_tokens",
	"input_video_seconds",
	"output_video_seconds",
	"output_video",
	"cached_read_text_tokens",
	"implicit_cached_input_text_tokens",
	"cached_write_text_tokens",
	"cached_write_text_tokens_5m",
	"cached_write_text_tokens_1h",
	"cached_read_image_tokens",
	"cached_read_audio_tokens",
	"requests",
];

function formatCurrency(amount: number, currency: string): string {
	const normalizedCurrency = normalizeCurrencyCode(currency);
	const fractionDigits = amount === 0 ? 0 : amount < 0.0001 ? 8 : amount < 0.01 ? 4 : 2;
	const options: Intl.NumberFormatOptions = {
		style: "currency",
		currency: normalizedCurrency,
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	};
	try {
		return new Intl.NumberFormat("en-US", options).format(amount);
	} catch {
		return new Intl.NumberFormat("en-US", {
			...options,
			currency: "USD",
		}).format(amount);
	}
}

function normalizeCurrencyCode(currency: string): string {
	const normalized = currency.trim().toUpperCase();
	return /^[A-Z]{3}$/.test(normalized) ? normalized : "USD";
}

function normaliseRulePrice(rule: PricingRule): {
	price: number;
	formattedPrice: string;
	billingKey: string;
} | null {
	const rawPrice = Number(rule.price_per_unit);
	const unitSize = Number(rule.unit_size);
	if (!Number.isFinite(rawPrice) || rawPrice < 0 || !Number.isFinite(unitSize) || unitSize <= 0) {
		return null;
	}

	const unit = rule.unit.trim().toLowerCase().replace(/s$/, "");
	const millionUnitLabels: Record<string, string> = {
		token: "1M tokens",
		pixel: "1M pixels",
		character: "1M characters",
	};
	const millionUnitLabel = millionUnitLabels[unit];
	if (millionUnitLabel) {
		const price = rawPrice * (1_000_000 / unitSize);
		return {
			price,
			formattedPrice: `${formatCurrency(price, rule.currency)} per ${millionUnitLabel}`,
			billingKey: `${normalizeCurrencyCode(rule.currency)}:${millionUnitLabel}`,
		};
	}

	const price = rawPrice / unitSize;
	const unitLabel = unit || "unit";
	return {
		price,
		formattedPrice: `${formatCurrency(price, rule.currency)} per ${unitLabel}`,
		billingKey: `${normalizeCurrencyCode(rule.currency)}:${unitLabel}`,
	};
}

function getPricingHighlights(pricing: ProviderPricing[]): PricingHighlight[] {
	const candidates = pricing.flatMap((provider) =>
		provider.pricing_rules
			.filter((rule) => {
				const plan = rule.pricing_plan.trim().toLowerCase();
				return !plan || plan === "standard" || plan === "free";
			})
			.map((rule) => {
				const normalized = normaliseRulePrice(rule);
				if (!normalized) return null;
				return {
					meter: rule.meter,
					...normalized,
				};
			})
			.filter(isNonNull),
	);

	const lowestByMeter = new Map<string, (typeof candidates)[number]>();
	for (const candidate of candidates) {
		const key = `${candidate.meter}:${candidate.billingKey}`;
		const current = lowestByMeter.get(key);
		if (!current || candidate.price < current.price) lowestByMeter.set(key, candidate);
	}

	return Array.from(lowestByMeter.values())
		.sort((a, b) => {
			const aPriority = PRICING_METER_PRIORITY.indexOf(a.meter);
			const bPriority = PRICING_METER_PRIORITY.indexOf(b.meter);
			return (aPriority < 0 ? 100 : aPriority) - (bPriority < 0 ? 100 : bPriority);
		})
		.slice(0, 4)
		.map((candidate) => ({
			key: `${candidate.meter}:${candidate.billingKey}`,
			label:
				PRICING_METER_LABELS.get(candidate.meter) ??
				candidate.meter
					.replace(/_/g, " ")
					.replace(/\b\w/g, (letter) => letter.toUpperCase()),
			formattedPrice: candidate.formattedPrice,
		}));
}

export default function ModelFaqSection({
	model,
	benchmarkCount,
	activeProviderCount,
	isGatewayActive,
	pricing,
	relatedModels,
	gatewayMetadata,
	showProviders = true,
}: {
	model: ModelOverviewPage;
	benchmarkCount: number;
	activeProviderCount: number;
	isGatewayActive: boolean;
	pricing: ProviderPricing[];
	relatedModels?: ModelLineageLinks;
	gatewayMetadata?: ModelGatewayMetadata | null;
	showProviders?: boolean;
}) {
	const modelName = model.name;
	const organisationName = model.organisation.name;
	const modelDescription = model.description?.trim();
	const plainModelDescription = markdownToPlainText(modelDescription);
	const descriptionPrefix =
		plainModelDescription && descriptionStartsWithModelName(plainModelDescription, modelName)
			? ""
			: `${modelName} is `;
	const aboutAnswerText = plainModelDescription
		? `${descriptionPrefix}${ensureSentencePunctuation(plainModelDescription)}`
		: `${modelName} is ${getStatusDescription(model.status)} from ${organisationName}.`;
	const releaseDate = model.release_date ?? model.announcement_date ?? null;
	const inputTypes = parseTypes(model.input_types);
	const outputTypes = parseTypes(model.output_types);
	const inputContextLength = getNumericDetail(
		model,
		"input_context_length",
		"context_length",
		"max_context_length",
	);
	const outputContextLength = getNumericDetail(
		model,
		"output_context_length",
		"max_output_tokens",
	);
	const pricingHighlights = isGatewayActive ? getPricingHighlights(pricing) : [];
	const faqProviders = getFaqProviders(pricing);
	// Native tool definitions are the minimum requirement for tool calling.
	// tool_choice controls selection behaviour but cannot establish tool support alone.
	const toolCallingSupport = getCapabilitySupport(gatewayMetadata, ["tools"]);
	const structuredOutputSupport = getCapabilitySupport(gatewayMetadata, [
		"structured_outputs",
	]);

	const items = [
		{
			question: `What is ${modelName}?`,
			answer: modelDescription && plainModelDescription ? (
				<>
					{descriptionPrefix}
					<ReactMarkdown
						remarkPlugins={[remarkGfm]}
						components={modelMarkdownComponents}
					>
						{modelDescription}
					</ReactMarkdown>
				</>
			) : (
				<>
					{modelName} is {getStatusDescription(model.status)} from{" "}
					<Link
						href={`/organisations/${model.organisation_id}`}
						className="font-medium underline underline-offset-4"
					>
						{organisationName}
					</Link>
					.
				</>
			),
		},
		...(inputContextLength || outputContextLength
			? [
					{
						question: `What is the context length of ${modelName}?`,
						answer: (
							<>
								{inputContextLength
									? `${modelName} has a recorded input context length of ${inputContextLength.toLocaleString("en-US")} tokens`
									: `${modelName} does not have an input context length recorded`}
								{outputContextLength
									? ` and a recorded maximum output length of ${outputContextLength.toLocaleString("en-US")} tokens`
									: ""}
								.
							</>
						),
					},
				]
			: []),
		...(pricingHighlights.length > 0
			? [
					{
						question: `How much does ${modelName} cost?`,
						answer: (
							<>
				The lowest base rates currently recorded across providers for {modelName} are{" "}
				{pricingHighlights.map((highlight, index) => (
					<span key={highlight.key}>
										{index > 0 ? (index === pricingHighlights.length - 1 ? "; and " : "; ") : ""}
										{highlight.label} at {highlight.formattedPrice}
									</span>
								))}
								. The{" "}
								<Link href="#pricing" className="font-medium underline underline-offset-4">
									pricing section
								</Link>{" "}
								shows every recorded provider, pricing plan, meter, and condition.
							</>
						),
					},
				]
			: []),
		...(showProviders
			? [
					{
						question: `What providers serve ${modelName}, and can I use it via API?`,
						answer: (
						<>
							{isGatewayActive && activeProviderCount > 0
								? `${modelName} is available through the Phaseo API, with ${activeProviderCount} active ${activeProviderCount === 1 ? "provider" : "providers"} currently recorded. `
								: `${modelName} is not currently marked as active in the Phaseo Gateway. `}
							{faqProviders.visible.length > 0 ? (
								<>
									Recorded providers include{" "}
									{faqProviders.visible.map((provider, index) => {
										const isLast = index === faqProviders.visible.length - 1;
										const separator =
											index === 0
												? ""
												: faqProviders.remainingCount > 0
													? ", "
													: faqProviders.visible.length === 2
														? " and "
														: isLast
															? ", and "
															: ", ";
										return (
											<span key={provider.id}>
												{separator}
												<Link
													href={`/api-providers/${provider.id}`}
													className="font-medium underline underline-offset-4"
												>
													{provider.name}
												</Link>
											</span>
										);
									})}
									{faqProviders.remainingCount > 0
										? `, and ${faqProviders.remainingCount} more. `
										: ". "}
								</>
							) : null}
							The{" "}
							<Link href="#providers" className="font-medium underline underline-offset-4">
								providers section
							</Link>{" "}
							shows the routes and availability currently recorded by Phaseo.
						</>
						),
					},
				]
			: []),
		{
			question: `Does ${modelName} support tool calling?`,
			answer: capabilityAnswer({
				modelName,
				label: "tool calling",
				support: toolCallingSupport,
				isGatewayActive,
			}),
		},
		{
			question: `Does ${modelName} support structured outputs?`,
			answer: capabilityAnswer({
				modelName,
				label: "structured outputs",
				support: structuredOutputSupport,
				isGatewayActive,
			}),
		},
		...(relatedModels?.previous || relatedModels?.next || model.family_id
			? [
					{
						question: `What models are related to ${modelName}?`,
						answer: (
							<>
								{relatedModels?.previous ? (
									<>
										Phaseo records{" "}
										<Link
											href={`/models/${relatedModels.previous.modelId}`}
											className="font-medium underline underline-offset-4"
										>
											{relatedModels.previous.modelName}
										</Link>{" "}
										as the previous model.{" "}
									</>
								) : null}
								{relatedModels?.next ? (
									<>
										<Link
											href={`/models/${relatedModels.next.modelId}`}
											className="font-medium underline underline-offset-4"
										>
											{relatedModels.next.modelName}
										</Link>{" "}
										is recorded as the next model.{" "}
									</>
								) : null}
								{model.family_id ? (
									<>
										View the{" "}
										<Link
											href={`/families/${model.family_id}`}
											className="font-medium underline underline-offset-4"
										>
											model family
										</Link>{" "}
										for the complete release history.
									</>
								) : null}
							</>
						),
					},
				]
			: []),
		...(benchmarkCount > 0
			? [
					{
						question: `What benchmark results are available for ${modelName}?`,
						answer: (
							<>
								Phaseo currently tracks {benchmarkCount}{" "}
								{benchmarkCount === 1 ? "benchmark result" : "benchmark results"}
								{" "}for {modelName}. Review the{" "}
								<Link href="#benchmarks" className="font-medium underline underline-offset-4">
									benchmark section
								</Link>{" "}
								for scores, ranks, methodology context, and available sources.
							</>
						),
					},
				]
			: []),
		...(inputTypes.length > 0 || outputTypes.length > 0
			? [
					{
						question: `What modalities does ${modelName} support?`,
						answer: (
							<>
								{inputTypes.length > 0
									? `${modelName} accepts ${joinNaturalList(inputTypes)} input${inputTypes.length === 1 ? "" : "s"}. `
									: ""}
								{outputTypes.length > 0
									? `It produces ${joinNaturalList(outputTypes)} output${outputTypes.length === 1 ? "" : "s"}.`
									: ""}
							</>
						),
					},
				]
			: []),
		...(releaseDate
			? [
					{
						question: `When was ${modelName} released?`,
						answer: `${modelName} was ${model.release_date ? "released" : "announced"} on ${formatModelLifecycleDate(releaseDate)}.`,
					},
				]
			: []),
	];
	const faqSchema = {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: [
			{
				"@type": "Question",
				name: `What is ${modelName}?`,
				acceptedAnswer: {
					"@type": "Answer",
					text: aboutAnswerText,
				},
			},
			...(inputContextLength || outputContextLength
				? [{
					"@type": "Question",
					name: `What is the context length of ${modelName}?`,
					acceptedAnswer: {
						"@type": "Answer",
						text: `${inputContextLength ? `${modelName} has a recorded input context length of ${inputContextLength.toLocaleString("en-US")} tokens` : `${modelName} does not have an input context length recorded`}${outputContextLength ? ` and a recorded maximum output length of ${outputContextLength.toLocaleString("en-US")} tokens` : ""}.`,
					},
				}]
				: []),
			...(showProviders
				? [
						{
							"@type": "Question",
							name: `What providers serve ${modelName}, and can I use it via API?`,
							acceptedAnswer: {
								"@type": "Answer",
								text: `${isGatewayActive && activeProviderCount > 0 ? `${modelName} is available through the Phaseo API, with ${activeProviderCount} active ${activeProviderCount === 1 ? "provider" : "providers"} currently recorded.` : `${modelName} is not currently marked as active in the Phaseo Gateway.`}${faqProviders.visible.length > 0 ? ` Recorded providers include ${joinNaturalList(faqProviders.visible.map((provider) => provider.name))}${faqProviders.remainingCount > 0 ? ` and ${faqProviders.remainingCount} more` : ""}.` : ""}`,
							},
						},
					]
				: []),
			{
				"@type": "Question",
				name: `Does ${modelName} support tool calling?`,
				acceptedAnswer: { "@type": "Answer", text: capabilityAnswer({ modelName, label: "tool calling", support: toolCallingSupport, isGatewayActive }) },
			},
			{
				"@type": "Question",
				name: `Does ${modelName} support structured outputs?`,
				acceptedAnswer: { "@type": "Answer", text: capabilityAnswer({ modelName, label: "structured outputs", support: structuredOutputSupport, isGatewayActive }) },
			},
		],
	};

	return (
		<section id="faq" className="scroll-mt-28 space-y-4 border-t border-border/60 pt-5">
			<JsonLdScript id="model-faq-json-ld" data={faqSchema} />
			<h2 className="text-xl font-semibold tracking-tight">
				Frequently Asked Questions
			</h2>
			<ModelFaqAccordion items={items} />
		</section>
	);
}
