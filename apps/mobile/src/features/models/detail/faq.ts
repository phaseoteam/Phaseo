import type { GatewayMetadata, ModelDetail, ProviderPricing } from "@/lib/api/models";
import type { Lineage } from "./about";

/** A piece of an answer: plain text, or a link to another page or to a section of this one. */
export type FaqPart = string | { text: string; model?: string; provider?: string; section?: "pricing" | "providers" | "benchmarks"; family?: string; organisation?: string };
export type FaqItem = { key: string; question: string; answer: FaqPart[] };

const MAX_PROVIDER_NAMES = 8;

const STATUS_DESCRIPTIONS: Record<string, string> = {
  Rumoured: "a rumoured AI model",
  Announced: "an announced AI model",
  Preview: "a preview AI model",
  "Limited Access": "a limited-access AI model",
  Withheld: "a withheld AI model",
  Deprecated: "a deprecated AI model",
  Retired: "a retired AI model",
};

const MODALITY_NAMES: Record<string, string> = {
  text: "Text", image: "Image", video: "Video", audio: "Audio", "audio stt": "Speech to text", "audio tts": "Text to speech", "audio music": "Music",
  file: "File", embeddings: "Embeddings", code: "Code", vision: "Vision", speech: "Speech", multimodal: "Multimodal", embedding: "Embedding", rerank: "Reranking", moderation: "Moderation", moderations: "Moderation",
};

/** The website's meter names (apps/web messages, Catalogue.modelDetail.pricing.meters). */
export const METER_NAMES: Record<string, string> = {
  input_text_tokens: "Input text tokens", input_tokens: "Input tokens", output_text_tokens: "Output text tokens", output_tokens: "Output tokens",
  cached_read_text_tokens: "Cache read tokens", cached_write_text_tokens: "Cache write tokens", implicit_cached_input_text_tokens: "Implicit cached input text tokens",
  input_image_tokens: "Input image tokens", output_image_tokens: "Output image tokens", input_audio_tokens: "Input audio tokens", output_audio_tokens: "Output audio tokens",
  input_video_tokens: "Input video tokens", output_video_tokens: "Output video tokens", input_image: "Input image", output_image: "Output image", output_video: "Output video",
  input_characters: "Input characters", input_text_bytes: "Input text bytes", input_pages: "Input pages", input_text_messages: "Input text messages",
  input_audio_minutes: "Input audio minutes", input_audio_seconds: "Input audio seconds", image_pixels: "Image pixels", video_pixels: "Video pixels",
  output_reasoning_tokens: "Output reasoning tokens", cached_read_image_tokens: "Cache read image tokens", cached_read_video_tokens: "Cache read video tokens",
  cached_read_audio_tokens: "Cache read audio tokens", output_audio_minutes: "Output audio minutes", output_audio_seconds: "Output audio seconds",
  audio_minutes: "Audio minutes", audio_seconds: "Audio seconds", cached_write_text_tokens_5m: "Cache write text tokens (5 min TTL)",
  cached_write_text_tokens_1h: "Cache write text tokens (1 hour TTL)", output_video_seconds: "Output video seconds", output_video_frames: "Output video frames",
  bfl_credits: "BFL credits", server_tool_web_search_requests: "Server tool web search requests", server_tool_web_search_extra_results: "Server tool web search extra results",
  server_tool_web_fetch_requests: "Server tool web fetch requests", server_tool_advisor_requests: "Server tool advisor requests",
  server_tool_image_generation_requests: "Server tool image generation requests", server_tool_apply_patch_requests: "Server tool apply patch requests",
  native_web_search_requests: "Native web search requests", native_web_fetch_requests: "Native web fetch requests", input_video_seconds: "Input video seconds",
  total_tokens: "Total tokens", requests: "Requests",
};

export const meterName = (meter: string) => METER_NAMES[meter] ?? "Pricing meter";

const METER_PRIORITY = [
  "input_text_tokens", "input_tokens", "output_text_tokens", "output_tokens", "output_reasoning_tokens", "input_image_tokens", "output_image_tokens", "input_image", "output_image",
  "input_audio_tokens", "output_audio_tokens", "input_audio_seconds", "input_audio_minutes", "output_audio_seconds", "output_audio_minutes", "audio_seconds", "audio_minutes",
  "input_video_tokens", "output_video_tokens", "input_video_seconds", "output_video_seconds", "output_video", "cached_read_text_tokens", "implicit_cached_input_text_tokens",
  "cached_write_text_tokens", "cached_write_text_tokens_5m", "cached_write_text_tokens_1h", "cached_read_image_tokens", "cached_read_audio_tokens", "requests",
];
const SINGULAR_UNITS = new Set(["token", "pixel", "character", "image", "video", "second", "credit", "request", "byte", "page", "minute"]);

export const joinList = (values: string[]) => (values.length <= 1 ? values.join("") : values.length === 2 ? `${values[0]} and ${values[1]}` : `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`);

const parseFaqTypes = (value: string | null | undefined) => [...new Set((value ?? "").split(",").map((item) => item.trim().replace(/[_-]+/g, " ")).filter(Boolean))];

function numericDetail(model: ModelDetail, ...names: string[]) {
  for (const name of names) {
    const value = Number(model.model_details?.find((item) => item.detail_name.trim().toLowerCase() === name)?.detail_value);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function capabilitySupport(metadata: GatewayMetadata | null | undefined, params: string[]): "supported" | "unsupported" | "unknown" {
  if (!metadata) return "unknown";
  const rows = Object.values(metadata.supportedParametersByEndpoint).flat().filter((row) => params.includes(row.param_id));
  if (!rows.length) return "unknown";
  return rows.some((row) => row.provider_count_supported > 0) ? "supported" : "unsupported";
}

function capabilityAnswer(model: string, label: string, support: ReturnType<typeof capabilitySupport>, isGatewayActive: boolean) {
  if (!isGatewayActive) return `${model} is not currently active in the Phaseo Gateway, so ${label} is not available through the API.`;
  if (support === "supported") return `Yes. At least one active provider route for ${model} currently advertises ${label} support. Provider support can vary, so requests are routed only to compatible routes.`;
  if (support === "unsupported") return `No active provider route for ${model} currently advertises ${label} support.`;
  return `Phaseo does not currently have enough active route metadata to confirm whether ${model} supports ${label}.`;
}

function formatCurrency(amount: number, currency: string) {
  const code = /^[A-Z]{3}$/.test(currency.trim().toUpperCase()) ? currency.trim().toUpperCase() : "USD";
  const digits = amount === 0 ? 0 : amount < 0.0001 ? 8 : amount < 0.01 ? 4 : 2;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
}

/** The lowest standard or free base rate per meter across providers, at most four (getPricingHighlights). */
export function pricingHighlights(pricing: ProviderPricing[]) {
  const lowest = new Map<string, { meter: string; price: number; text: string }>();
  for (const provider of pricing) {
    for (const rule of provider.pricing_rules) {
      const plan = (rule.pricing_plan ?? "").trim().toLowerCase();
      if (plan && plan !== "standard" && plan !== "free") continue;
      const raw = Number(rule.price_per_unit);
      const size = Number(rule.unit_size);
      if (!Number.isFinite(raw) || raw < 0 || !Number.isFinite(size) || size <= 0) continue;
      const unit = (rule.unit ?? "").trim().toLowerCase().replace(/s$/, "");
      const millionUnit = ({ token: "tokens", pixel: "pixels", character: "characters" } as Record<string, string>)[unit];
      const currency = rule.currency ?? "USD";
      const price = millionUnit ? raw * (1_000_000 / size) : raw / size;
      const text = millionUnit ? `${formatCurrency(price, currency)} per million ${millionUnit}` : `${formatCurrency(price, currency)} per ${SINGULAR_UNITS.has(unit) ? unit : "unit"}`;
      const key = `${rule.meter}:${currency}:${millionUnit ?? unit}`;
      const current = lowest.get(key);
      if (!current || price < current.price) lowest.set(key, { meter: rule.meter ?? "", price, text });
    }
  }
  const rank = (meter: string) => (METER_PRIORITY.indexOf(meter) < 0 ? 100 : METER_PRIORITY.indexOf(meter));
  return [...lowest.values()].sort((a, b) => rank(a.meter) - rank(b.meter)).slice(0, 4)
    .map((entry) => `${meterName(entry.meter)} at ${entry.text}`);
}

/** Provider names for the providers answer, alphabetical, eight at most. */
function faqProviders(pricing: ProviderPricing[]) {
  const byId = new Map<string, { id: string; name: string }>();
  for (const entry of pricing) {
    const id = entry.provider.api_provider_id?.trim() ?? "";
    const name = entry.provider.api_provider_name?.trim() ?? "";
    if (id && name && !byId.has(id)) byId.set(id, { id, name });
  }
  const providers = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { visible: providers.slice(0, MAX_PROVIDER_NAMES), remaining: Math.max(providers.length - MAX_PROVIDER_NAMES, 0) };
}

const sentence = (value: string) => (/[.!?]$/.test(value.trim()) ? value.trim() : `${value.trim()}.`);

/**
 * The model page's frequently asked questions, built as the website builds them: the same questions,
 * conditions and answers (English copy from apps/web messages, Catalogue.models.detail.faqContent).
 */
export function buildFaq({ model, description, benchmarkCount, activeProviderCount, isGatewayActive, showProviders, pricing, related, gateway }: {
  model: ModelDetail;
  description: string | null;
  benchmarkCount: number;
  activeProviderCount: number;
  isGatewayActive: boolean;
  showProviders: boolean;
  pricing: ProviderPricing[];
  related: Lineage;
  gateway: GatewayMetadata | null | undefined;
}): FaqItem[] {
  const name = model.name ?? model.id;
  const organisation = model.organisation?.name ?? model.organisation_id ?? "";
  const status = STATUS_DESCRIPTIONS[model.status ?? ""] ?? "an AI model";
  const plain = description?.replace(/[#*_`>[\]()]/g, "").replace(/\s+/g, " ").trim() || null;
  const prefix = plain && plain.toLocaleLowerCase().startsWith(name.trim().toLocaleLowerCase()) ? "" : `${name}: `;
  const items: FaqItem[] = [];

  items.push({
    key: "model",
    question: `What is ${name}?`,
    answer: plain ? [`${prefix}${sentence(plain)}`] : [`${name} is ${status} from `, { text: organisation, organisation: model.organisation_id ?? undefined }, "."],
  });

  const inputLength = numericDetail(model, "input_context_length", "context_length", "max_context_length");
  const outputLength = numericDetail(model, "output_context_length", "max_output_tokens");
  if (inputLength || outputLength) {
    const format = (value: number) => value.toLocaleString("en-US");
    items.push({
      key: "contextLength",
      question: `What is the context length of ${name}?`,
      answer: [inputLength
        ? `${name} has a recorded input context length of ${format(inputLength)} tokens${outputLength ? ` and a recorded maximum output length of ${format(outputLength)} tokens.` : "."}`
        : `${name} does not have an input context length recorded, but its recorded maximum output length is ${format(outputLength!)} tokens.`],
    });
  }

  const highlights = isGatewayActive ? pricingHighlights(pricing) : [];
  if (highlights.length) {
    items.push({
      key: "cost",
      question: `How much does ${name} cost?`,
      answer: [`The lowest base rates currently recorded across providers for ${name} are ${joinList(highlights)}. The `, { text: "pricing section", section: "pricing" }, " shows every recorded provider, pricing plan, meter, and condition."],
    });
  }

  if (showProviders) {
    const providers = faqProviders(pricing);
    const answer: FaqPart[] = [isGatewayActive && activeProviderCount > 0
      ? `${name} is available through the Phaseo API. Active providers currently recorded: ${activeProviderCount}. `
      : `${name} is not currently marked as active in the Phaseo Gateway. `];
    if (providers.visible.length) {
      answer.push("Recorded providers include ");
      providers.visible.forEach((provider, index) => {
        if (index > 0) answer.push(index < providers.visible.length - 1 ? ", " : providers.visible.length > 2 ? ", and " : " and ");
        answer.push({ text: provider.name, provider: provider.id });
      });
      answer.push(providers.remaining ? `, and ${providers.remaining} more. ` : ". ");
    }
    answer.push("The ", { text: "providers section", section: "providers" }, " shows the routes and availability currently recorded by Phaseo.");
    items.push({ key: "providers", question: `What providers serve ${name}, and can I use it via API?`, answer });
  }

  items.push({ key: "toolCalling", question: `Does ${name} support tool calling?`, answer: [capabilityAnswer(name, "tool calling", capabilitySupport(gateway, ["tools"]), isGatewayActive)] });
  items.push({ key: "structuredOutputs", question: `Does ${name} support structured outputs?`, answer: [capabilityAnswer(name, "structured outputs", capabilitySupport(gateway, ["structured_outputs"]), isGatewayActive)] });

  if (related.previous || related.next || model.family_id) {
    const answer: FaqPart[] = [];
    if (related.previous) answer.push("Phaseo records ", { text: related.previous.modelName, model: related.previous.modelId }, " as the previous model. ");
    if (related.next) answer.push({ text: related.next.modelName, model: related.next.modelId }, " is recorded as the next model. ");
    if (model.family_id) answer.push("View the ", { text: "model family", family: model.family_id }, " for the complete release history.");
    items.push({ key: "relatedModels", question: `What models are related to ${name}?`, answer });
  }

  if (benchmarkCount > 0) {
    items.push({
      key: "benchmarks",
      question: `What benchmark results are available for ${name}?`,
      answer: [`Phaseo currently tracks ${benchmarkCount} benchmark results for ${name}. Review the `, { text: "benchmark section", section: "benchmarks" }, " for scores, ranks, methodology context, and available sources."],
    });
  }

  const inputs = parseFaqTypes(model.input_types ?? model.input_modalities.join(","));
  const outputs = parseFaqTypes(model.output_types ?? model.output_modalities.join(","));
  if (inputs.length || outputs.length) {
    const named = (types: string[]) => joinList(types.map((type) => MODALITY_NAMES[type.toLowerCase()] ?? type));
    items.push({
      key: "modalities",
      question: `What modalities does ${name} support?`,
      answer: [[inputs.length ? `${name} accepts these input modalities: ${named(inputs)}.` : "", outputs.length ? `${name} can produce these output modalities: ${named(outputs)}.` : ""].filter(Boolean).join(" ")],
    });
  }

  const releaseDate = model.release_date ?? model.announcement_date ?? null;
  if (releaseDate) {
    const date = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(releaseDate));
    items.push({ key: "releaseDate", question: `When was ${name} released?`, answer: [`${name} was ${model.release_date ? "released" : "announced"} on ${date}.`] });
  }
  return items;
}
