import Link from "next/link";

import { JsonLdScript } from "@/components/seo/JsonLdScript";
import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";
import type {
	PricingRule,
	ProviderPricing,
} from "@/lib/fetchers/models/getModelPricing";
import { formatModelLifecycleDate } from "@/lib/dates/modelLifecycleDates";
import { PRICING_METER_OPTIONS, PRICING_METER_VALUES } from "@/lib/pricing/meters";
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

function joinNaturalList(values: string[], locale: string): string {
	return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(values);
}

const MAX_FAQ_PROVIDER_NAMES = 8;

const PRICING_UNITS = new Set([
	"token",
	"pixel",
	"character",
	"image",
	"video",
	"second",
	"credit",
	"request",
	"byte",
	"page",
	"minute",
]);

type ModelFaqTranslate = (
	key: string,
	values?: Record<string, string | number>,
) => string;

const FAQ_MODALITY_KEYS: Record<string, string> = {
	text: "text",
	image: "image",
	video: "video",
	audio: "audio",
	"audio stt": "audioStt",
	"audio tts": "audioTts",
	"audio music": "audioMusic",
	file: "file",
	embeddings: "embeddings",
	code: "code",
	vision: "vision",
	speech: "speech",
	multimodal: "multimodal",
	embedding: "embedding",
	rerank: "rerank",
	moderation: "moderation",
	moderations: "moderation",
};

function localizeModalities(
	modalities: string[],
	translateModality?: (key: string) => string,
): string[] {
	return modalities.map((modality) => {
		const key = FAQ_MODALITY_KEYS[modality.toLowerCase()];
		return key && translateModality ? translateModality(key) : modality;
	});
}

function getFaqProviders(pricing: ProviderPricing[], locale: string) {
	const providersById = new Map<string, { id: string; name: string }>();
	for (const entry of pricing) {
		const id = entry.provider.api_provider_id.trim();
		const name = entry.provider.api_provider_name.trim();
		if (id && name && !providersById.has(id)) {
			providersById.set(id, { id, name });
		}
	}
	const providers = Array.from(providersById.values()).sort((left, right) =>
		left.name.localeCompare(right.name, locale),
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
	translate?: ModelFaqTranslate;
}) {
	if (args.translate) {
		if (!args.isGatewayActive) {
			return args.translate("answers.capabilityInactive", {
				model: args.modelName,
				label: args.label,
			});
		}
		if (args.support === "supported") {
			return args.translate("answers.capabilitySupported", {
				model: args.modelName,
				label: args.label,
			});
		}
		if (args.support === "unsupported") {
			return args.translate("answers.capabilityUnsupported", {
				model: args.modelName,
				label: args.label,
			});
		}
		return args.translate("answers.capabilityUnknown", {
			model: args.modelName,
			label: args.label,
		});
	}
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

function getStatusDescription(
	status: ModelOverviewPage["status"],
	translate?: ModelFaqTranslate,
): string {
	const statusKeys: Record<string, string> = {
		Rumoured: "rumoured",
		Announced: "announced",
		Preview: "preview",
		"Limited Access": "limitedAccess",
		Withheld: "withheld",
		Deprecated: "deprecated",
		Retired: "retired",
	};
	const key = status ? statusKeys[status] ?? "available" : "available";
	if (translate) return translate(`statuses.${key}`);
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

function formatCurrency(amount: number, currency: string, locale: string): string {
	const normalizedCurrency = normalizeCurrencyCode(currency);
	const fractionDigits = amount === 0 ? 0 : amount < 0.0001 ? 8 : amount < 0.01 ? 4 : 2;
	const options: Intl.NumberFormatOptions = {
		style: "currency",
		currency: normalizedCurrency,
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	};
	try {
		return new Intl.NumberFormat(locale, options).format(amount);
	} catch {
		return new Intl.NumberFormat(locale, {
			...options,
			currency: "USD",
		}).format(amount);
	}
}

function normalizeCurrencyCode(currency: string): string {
	const normalized = currency.trim().toUpperCase();
	return /^[A-Z]{3}$/.test(normalized) ? normalized : "USD";
}

function normaliseRulePrice(
	rule: PricingRule,
	locale: string,
	translatePricing?: ModelFaqTranslate,
): {
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
		const formattedCurrency = formatCurrency(price, rule.currency, locale);
		const unitLabel = translatePricing?.(`units.${unit}`) ?? millionUnitLabel.replace("1M ", "");
		return {
			price,
			formattedPrice: translatePricing
				? translatePricing("ratePerMillion", { price: formattedCurrency, unit: unitLabel })
				: `${formattedCurrency} per ${millionUnitLabel}`,
			billingKey: `${normalizeCurrencyCode(rule.currency)}:${millionUnitLabel}`,
		};
	}

	const price = rawPrice / unitSize;
	const unitLabel = translatePricing
		? translatePricing(`unitsSingular.${PRICING_UNITS.has(unit) ? unit : "unit"}`)
		: unit || "unit";
	const formattedCurrency = formatCurrency(price, rule.currency, locale);
	return {
		price,
		formattedPrice: translatePricing
			? translatePricing("ratePerUnit", { price: formattedCurrency, unit: unitLabel })
			: `${formattedCurrency} per ${unitLabel}`,
		billingKey: `${normalizeCurrencyCode(rule.currency)}:${unit || "unit"}`,
	};
}

function getPricingHighlights(
	pricing: ProviderPricing[],
	locale: string,
	translatePricing?: ModelFaqTranslate,
): PricingHighlight[] {
	const candidates = pricing.flatMap((provider) =>
		provider.pricing_rules
			.filter((rule) => {
				const plan = rule.pricing_plan.trim().toLowerCase();
				return !plan || plan === "standard" || plan === "free";
			})
			.map((rule) => {
				const normalized = normaliseRulePrice(rule, locale, translatePricing);
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
			label: translatePricing
				? PRICING_METER_VALUES.includes(candidate.meter as (typeof PRICING_METER_VALUES)[number])
					? translatePricing(`meters.${candidate.meter}`)
					: translatePricing("meter")
				: PRICING_METER_LABELS.get(candidate.meter) ??
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
	translate,
	translateModality,
	translatePricing,
	locale = "en-US",
}: {
	model: ModelOverviewPage;
	benchmarkCount: number;
	activeProviderCount: number;
	isGatewayActive: boolean;
	pricing: ProviderPricing[];
	relatedModels?: ModelLineageLinks;
	gatewayMetadata?: ModelGatewayMetadata | null;
	translate?: ModelFaqTranslate;
	translateModality?: (key: string) => string;
	translatePricing?: ModelFaqTranslate;
	locale?: string;
}) {
	const modelName = model.name;
	const statusDescription = getStatusDescription(model.status, translate);
	const question = (key: string, fallback: string) =>
		translate ? translate(`questions.${key}`, { model: modelName }) : fallback;
	const organisationName = model.organisation.name;
	const releaseDate = model.release_date ?? model.announcement_date ?? null;
	const inputTypes = parseTypes(model.input_types);
	const outputTypes = parseTypes(model.output_types);
	const localizedInputTypes = localizeModalities(inputTypes, translateModality);
	const localizedOutputTypes = localizeModalities(outputTypes, translateModality);
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
	const pricingHighlights = isGatewayActive
		? getPricingHighlights(pricing, locale, translatePricing)
		: [];
	const formatFaqPrice = (highlight: PricingHighlight) =>
		translatePricing
			? translatePricing("faqMeterPrice", {
					meter: highlight.label,
					price: highlight.formattedPrice,
				})
			: `${highlight.label}: ${highlight.formattedPrice}`;
	const faqProviders = getFaqProviders(pricing, locale);
	// Native tool definitions are the minimum requirement for tool calling.
	// tool_choice controls selection behaviour but cannot establish tool support alone.
	const toolCallingSupport = getCapabilitySupport(gatewayMetadata, ["tools"]);
	const structuredOutputSupport = getCapabilitySupport(gatewayMetadata, [
		"structured_outputs",
	]);
	let providerIndex = 0;
	const providerList = new Intl.ListFormat(locale, {
		style: "long",
		type: "conjunction",
	}).formatToParts(faqProviders.visible.map((provider) => provider.name)).map((part, index) => {
		if (part.type !== "element") return part.value;
		const provider = faqProviders.visible[providerIndex++];
		return provider ? (
			<Link
				key={`provider-${provider.id}`}
				href={`/api-providers/${provider.id}`}
				className="font-medium underline underline-offset-4"
			>
				{part.value}
			</Link>
		) : <span key={`provider-part-${index}`}>{part.value}</span>;
	});
	const formattedInputLength = inputContextLength
		? new Intl.NumberFormat(locale).format(inputContextLength)
		: null;
	const formattedOutputLength = outputContextLength
		? new Intl.NumberFormat(locale).format(outputContextLength)
		: null;
	const contextAnswerText = translate
		? inputContextLength
			? `${translate("answers.contextInputRecorded", { model: modelName, input: formattedInputLength! })}${outputContextLength ? translate("answers.contextOutputSuffix", { output: formattedOutputLength! }) : "."}`
			: translate("answers.contextOutputOnly", { model: modelName, output: formattedOutputLength! })
		: inputContextLength
			? `${modelName} has a recorded input context length of ${inputContextLength.toLocaleString(locale)} tokens${outputContextLength ? ` and a recorded maximum output length of ${outputContextLength.toLocaleString(locale)} tokens` : ""}.`
			: `${modelName} does not have an input context length recorded${outputContextLength ? ` and a recorded maximum output length of ${outputContextLength.toLocaleString(locale)} tokens` : ""}.`;
	const providerStatusText = isGatewayActive && activeProviderCount > 0
		? translate
			? translate("answers.providerActive", { model: modelName, count: activeProviderCount })
			: `${modelName} is available through the Phaseo API, with ${activeProviderCount} active ${activeProviderCount === 1 ? "provider" : "providers"} currently recorded.`
		: translate
			? translate("answers.providerInactive", { model: modelName })
			: `${modelName} is not currently marked as active in the Phaseo Gateway.`;
	const providerNameList = joinNaturalList(faqProviders.visible.map((provider) => provider.name), locale);
	const providerListText = faqProviders.visible.length > 0
		? `${translate ? translate("answers.providerListPrefix") : "Recorded providers include"} ${providerNameList}${faqProviders.remainingCount > 0 ? `, ${translate ? translate("answers.providerMore", { count: faqProviders.remainingCount }) : `and ${faqProviders.remainingCount} more`}` : ""}.`
		: "";
	const providerSectionText = `${translate ? translate("answers.providerSectionPrefix") : "The"} ${translate ? translate("links.providers") : "providers section"} ${translate ? translate("answers.providerSectionSuffix") : "shows the routes and availability currently recorded by Phaseo."}`;
	const providerAnswerText = [providerStatusText, providerListText, providerSectionText].filter(Boolean).join(" ");
	const modelAnswerText = `${translate ? translate("answers.modelPrefix", { model: modelName, status: statusDescription }) : `${modelName} is ${statusDescription} from`} ${organisationName}.`;
	const toolCallingLabel = translate?.("labels.toolCalling") ?? "tool calling";
	const structuredOutputsLabel = translate?.("labels.structuredOutputs") ?? "structured outputs";
	const toolCallingAnswer = capabilityAnswer({ modelName, label: toolCallingLabel, support: toolCallingSupport, isGatewayActive, translate });
	const structuredOutputsAnswer = capabilityAnswer({ modelName, label: structuredOutputsLabel, support: structuredOutputSupport, isGatewayActive, translate });

	const items = [
		{
			question: question("model", `What is ${modelName}?`),
			answer: (
				<>
					{translate
						? translate("answers.modelPrefix", { model: modelName, status: statusDescription })
						: `${modelName} is ${statusDescription} from`}{" "}
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
						question: question("contextLength", `What is the context length of ${modelName}?`),
						answer: contextAnswerText,
					},
				]
			: []),
		...(pricingHighlights.length > 0
			? [
					{
						question: question("cost", `How much does ${modelName} cost?`),
						answer: (
							<>
				{translate
					? translate("answers.costIntro", {
						model: modelName,
						rates: joinNaturalList(pricingHighlights.map(formatFaqPrice), locale),
					})
					: `The lowest base rates currently recorded across providers for ${modelName} are ${pricingHighlights.map((highlight) => `${highlight.label} at ${highlight.formattedPrice}`).join("; ")}.`}{" "}
				{translate ? translate("answers.pricingPrefix") : "The"}{" "}
				<Link href="#pricing" className="font-medium underline underline-offset-4">
					{translate ? translate("links.pricing") : "pricing section"}
				</Link>{" "}
				{translate ? translate("answers.pricingSuffix") : "shows every recorded provider, pricing plan, meter, and condition."}
							</>
						),
					},
				]
			: []),
		{
			question: question("providers", `What providers serve ${modelName}, and can I use it via API?`),
			answer: (
				<>
					{providerStatusText}{" "}
					{faqProviders.visible.length > 0 ? (
						<>
							{translate ? translate("answers.providerListPrefix") : "Recorded providers include"}{" "}
							{providerList}
							{faqProviders.remainingCount > 0
								? `, ${translate ? translate("answers.providerMore", { count: faqProviders.remainingCount }) : `and ${faqProviders.remainingCount} more`}. `
								: ". "}
						</>
					) : null}
					{translate ? translate("answers.providerSectionPrefix") : "The"}{" "}
					<Link href="#providers" className="font-medium underline underline-offset-4">
						{translate ? translate("links.providers") : "providers section"}
					</Link>{" "}
					{translate ? translate("answers.providerSectionSuffix") : "shows the routes and availability currently recorded by Phaseo."}
				</>
			),
		},
		{
			question: question("toolCalling", `Does ${modelName} support tool calling?`),
			answer: toolCallingAnswer,
		},
		{
			question: question("structuredOutputs", `Does ${modelName} support structured outputs?`),
			answer: structuredOutputsAnswer,
		},
		...(relatedModels?.previous || relatedModels?.next || model.family_id
			? [
					{
						question: question("relatedModels", `What models are related to ${modelName}?`),
						answer: (
							<>
								{relatedModels?.previous ? (
									<>
										{translate ? translate("answers.previousPrefix") : "Phaseo records"}{" "}
										<Link
											href={`/models/${relatedModels.previous.modelId}`}
											className="font-medium underline underline-offset-4"
										>
											{relatedModels.previous.modelName}
										</Link>{" "}
										{translate ? translate("answers.previousSuffix") : "as the previous model."}{" "}
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
										{translate ? translate("answers.nextSuffix") : "is recorded as the next model."}{" "}
									</>
								) : null}
								{model.family_id ? (
									<>
										{translate ? translate("answers.familyPrefix") : "View the"}{" "}
										<Link
											href={`/families/${model.family_id}`}
											className="font-medium underline underline-offset-4"
										>
											{translate ? translate("links.family") : "model family"}
										</Link>{" "}
										{translate ? translate("answers.familySuffix") : "for the complete release history."}
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
						question: question("benchmarks", `What benchmark results are available for ${modelName}?`),
						answer: (
							<>
								{translate
									? translate("answers.benchmarkIntro", { count: benchmarkCount, model: modelName })
									: `Phaseo currently tracks ${benchmarkCount} ${benchmarkCount === 1 ? "benchmark result" : "benchmark results"} for ${modelName}. Review the`}{" "}
								<Link href="#benchmarks" className="font-medium underline underline-offset-4">
									{translate ? translate("links.benchmarks") : "benchmark section"}
								</Link>{" "}
								{translate ? translate("answers.benchmarkSuffix") : "for scores, ranks, methodology context, and available sources."}
							</>
						),
					},
				]
			: []),
		...(inputTypes.length > 0 || outputTypes.length > 0
			? [
					{
						question: question("modalities", `What modalities does ${modelName} support?`),
						answer: (
							<>
								{inputTypes.length > 0
									? translate
										? translate("answers.modalitiesInput", { model: modelName, modalities: joinNaturalList(localizedInputTypes, locale) })
										: `${modelName} accepts ${joinNaturalList(inputTypes, locale)} input${inputTypes.length === 1 ? "" : "s"}. `
									: ""}
								{outputTypes.length > 0
									? translate
										? translate("answers.modalitiesOutput", { model: modelName, modalities: joinNaturalList(localizedOutputTypes, locale) })
										: `It produces ${joinNaturalList(outputTypes, locale)} output${outputTypes.length === 1 ? "" : "s"}.`
									: ""}
							</>
						),
					},
				]
			: []),
		...(releaseDate
			? [
					{
						question: question("releaseDate", `When was ${modelName} released?`),
						answer: translate
							? translate("answers.releaseDate", {
									model: modelName,
									verb: translate(model.release_date ? "answers.released" : "answers.announced"),
									date: new Intl.DateTimeFormat(locale, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(releaseDate)),
								})
							: `${modelName} was ${model.release_date ? "released" : "announced"} on ${formatModelLifecycleDate(releaseDate)}.`,
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
				name: question("model", `What is ${modelName}?`),
				acceptedAnswer: {
					"@type": "Answer",
					text: modelAnswerText,
				},
			},
			...(inputContextLength || outputContextLength
				? [{
					"@type": "Question",
					name: question("contextLength", `What is the context length of ${modelName}?`),
					acceptedAnswer: {
						"@type": "Answer",
						text: contextAnswerText,
					},
				}]
				: []),
			{
				"@type": "Question",
				name: question("providers", `What providers serve ${modelName}, and can I use it via API?`),
				acceptedAnswer: {
					"@type": "Answer",
					text: providerAnswerText,
				},
			},
			{
				"@type": "Question",
				name: question("toolCalling", `Does ${modelName} support tool calling?`),
				acceptedAnswer: { "@type": "Answer", text: toolCallingAnswer },
			},
			{
				"@type": "Question",
				name: question("structuredOutputs", `Does ${modelName} support structured outputs?`),
				acceptedAnswer: { "@type": "Answer", text: structuredOutputsAnswer },
			},
		],
	};

	return (
		<section id="faq" className="scroll-mt-28 space-y-4 border-t border-border/60 pt-5">
			<JsonLdScript id="model-faq-json-ld" data={faqSchema} />
			<h2 className="text-xl font-semibold tracking-tight">
				{translate?.("title") ?? "Frequently Asked Questions"}
			</h2>
			<ModelFaqAccordion items={items} />
		</section>
	);
}
