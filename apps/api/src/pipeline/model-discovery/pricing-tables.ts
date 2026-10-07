// Purpose: Watch authoritative pricing tables when a provider's model API omits pricing.
// Why: A content fingerprint gives us a safe review signal without attempting brittle, silent catalogue updates.
// How: Retain only price-bearing HTML tables, normalize their text, and hash the result per provider.

export type PricingTableSource = {
	providerId: string;
	providerName: string;
	sourceUrl: string;
	extraction?: "tables" | "price-content" | "mdx";
};

export type PricingTableSnapshot = PricingTableSource & {
	fingerprint: string;
	tableCount: number;
	pricingSamples: string[];
	/** Normalized price-bearing lines retained for next-run diffing. */
	contentLines: string[];
	/** Lines present now that were absent in the previous snapshot (empty without a baseline). */
	addedSamples: string[];
	/** Lines present in the previous snapshot that are gone now (empty without a baseline). */
	removedSamples: string[];
};

export type PricingTableFetchResult = {
	snapshots: PricingTableSnapshot[];
	errors: string[];
};

export const PRICING_TABLE_SOURCES: PricingTableSource[] = [
	{ providerId: "alibaba", providerName: "Alibaba Cloud Model Studio", sourceUrl: "https://www.alibabacloud.com/help/en/model-studio/model-pricing", extraction: "price-content" },
	{ providerId: "anthropic", providerName: "Anthropic", sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing" },
	{ providerId: "byteplus", providerName: "BytePlus ModelArk", sourceUrl: "https://docs.byteplus.com/en/docs/Byteplus_LAS/Large_model_billing" },
	{ providerId: "cerebras", providerName: "Cerebras", sourceUrl: "https://www.cerebras.ai/pricing", extraction: "price-content" },
	{ providerId: "cohere", providerName: "Cohere", sourceUrl: "https://cohere.com/pricing", extraction: "price-content" },
	{ providerId: "cloudflare", providerName: "Cloudflare Workers AI", sourceUrl: "https://developers.cloudflare.com/workers-ai/platform/pricing/" },
	{ providerId: "deepseek", providerName: "DeepSeek", sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing" },
	{ providerId: "fireworks", providerName: "Fireworks", sourceUrl: "https://docs.fireworks.ai/serverless/pricing" },
	{ providerId: "google-ai-studio", providerName: "Google AI Studio", sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing" },
	{ providerId: "mistral", providerName: "Mistral", sourceUrl: "https://docs.mistral.ai/inference/pricing" },
	{ providerId: "moonshotai", providerName: "Moonshot AI", sourceUrl: "https://platform.kimi.ai/docs/pricing/chat-k26.md", extraction: "mdx" },
	{ providerId: "openai", providerName: "OpenAI", sourceUrl: "https://developers.openai.com/api/docs/pricing" },
	{ providerId: "perplexity", providerName: "Perplexity", sourceUrl: "https://docs.perplexity.ai/docs/getting-started/pricing" },
	{ providerId: "stepfun", providerName: "StepFun", sourceUrl: "https://platform.stepfun.com/docs/zh/guides/pricing/details" },
	{ providerId: "voyage", providerName: "Voyage", sourceUrl: "https://docs.voyageai.com/docs/pricing" },
	{ providerId: "weights-and-biases", providerName: "Weights & Biases", sourceUrl: "https://wandb.ai/site/pricing/tokens/" },
	{ providerId: "xiaomi", providerName: "Xiaomi MiMo", sourceUrl: "https://mimo.mi.com/docs/en-US/pricing", extraction: "price-content" },
	{ providerId: "z-ai", providerName: "Z.AI", sourceUrl: "https://docs.z.ai/guides/overview/pricing" },
];

const TABLE_PATTERN = /<table\b[^>]*>[\s\S]*?<\/table>/gi;
const TAG_PATTERN = /<[^>]+>/g;
const PRICE_TEXT_PATTERN = /(?:pricing|price|\$\s*\d|usd\s*\d|\d\s*usd|per\s*(?:million|1m|mtok)|\/\s*(?:m|mtok)|¥|cny|rmb|元)/i;
const NON_CONTENT_PATTERN = /<(?:script|style|svg|noscript|template)\b[^>]*>[\s\S]*?<\/(?:script|style|svg|noscript|template)\b[^>]*>/gi;
const PRICE_VALUE_PATTERN = /(?:\$|¥|€)\s*\d+(?:\.\d+)?(?:\s*\/?\s*(?:1?m|million|mtok|month|mo|hour|user|1000))?/gi;
const MDX_TABLE_PATTERN = /<DocTable\b[\s\S]*?\n\s*\/>/gi;
const MAX_PRICING_SAMPLES = 6;
const MAX_STORED_CONTENT_LINES = 120;
const MAX_STORED_CONTENT_LINE_CHARS = 240;

export function hasPricingSourceChanged(
	previous: { source_url: string; fingerprint: string } | undefined,
	current: { sourceUrl: string; fingerprint: string },
): boolean {
	// A replacement source needs its own baseline; unrelated pages are not a pricing diff.
	return Boolean(previous && previous.source_url === current.sourceUrl && previous.fingerprint !== current.fingerprint);
}

export function pricingContentLines(text: string): string[] {
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(0, MAX_STORED_CONTENT_LINES)
		.map((line) => truncateLine(line));
}

function truncateLine(line: string): string {
	if (line.length <= MAX_STORED_CONTENT_LINE_CHARS) return line;
	return `${line.slice(0, MAX_STORED_CONTENT_LINE_CHARS - 1)}…`;
}

export function diffPricingTableContent(
	previousLines: string[] | null,
	currentLines: string[],
): { added: string[]; removed: string[] } {
	if (!previousLines) return { added: [], removed: [] };
	const previous = new Set(previousLines);
	const current = new Set(currentLines);
	return {
		added: currentLines.filter((line) => !previous.has(line)),
		removed: previousLines.filter((line) => !current.has(line)),
	};
}

function decodeHtml(value: string): string {
	return value
		.replace(/&nbsp;/gi, " ")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&quot;/gi, '"')
		.replace(/&amp;/gi, "&");
}

function tableText(tableHtml: string): string {
	return decodeHtml(tableHtml.replace(TAG_PATTERN, " ")).replace(/\s+/g, " ").trim();
}

export function extractPricingTableText(html: string): { text: string; tableCount: number } {
	const tables = html.match(TABLE_PATTERN) ?? [];
	const priceTables = Array.from(new Set(tables.map(tableText).filter((text) => PRICE_TEXT_PATTERN.test(text)))).sort();
	return { text: priceTables.join("\n"), tableCount: priceTables.length };
}

export function extractPriceContentText(html: string): { text: string; tableCount: number } {
	const content = tableText(html.replace(NON_CONTENT_PATTERN, " "));
	const priceSnippets = Array.from(content.matchAll(PRICE_VALUE_PATTERN), (match) => {
		const index = match.index ?? 0;
		return content.slice(Math.max(0, index - 120), Math.min(content.length, index + match[0].length + 180)).trim();
	});
	const normalizedSnippets = Array.from(new Set(priceSnippets.filter((text) => PRICE_TEXT_PATTERN.test(text)))).sort();
	return { text: normalizedSnippets.join("\n"), tableCount: normalizedSnippets.length };
}

export function extractMdxPricingText(markdown: string): { text: string; tableCount: number } {
	const mdxTables = (markdown.match(MDX_TABLE_PATTERN) ?? [])
		.map((table) => table.replace(/\{\s*["']\$["']\s*\}/g, "$"))
		.map((table) => decodeHtml(table.replace(/^<DocTable\b/i, "").replace(/\/>\s*$/, "").replace(/<\/?\s*>/g, "")).replace(/\s+/g, " ").trim())
		.filter((text) => PRICE_TEXT_PATTERN.test(text));
	const priceTables = Array.from(new Set(mdxTables)).sort();
	return { text: priceTables.join("\n"), tableCount: priceTables.length };
}

export function extractPricingSourceText(
	body: string,
	extraction: PricingTableSource["extraction"] = "tables",
): { text: string; tableCount: number } {
	if (extraction === "price-content") return extractPriceContentText(body);
	if (extraction === "mdx") return extractMdxPricingText(body);
	return extractPricingTableText(body);
}

function extractPricingSamples(text: string): string[] {
	const samples = Array.from(text.matchAll(PRICE_VALUE_PATTERN), (match) => {
		const index = match.index ?? 0;
		return text.slice(Math.max(0, index - 100), Math.min(text.length, index + match[0].length + 140)).trim();
	});
	return Array.from(new Set(samples)).sort().slice(0, MAX_PRICING_SAMPLES);
}

async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fetchPricingTableSnapshots(
	previousContentByProvider: Map<string, string[]> = new Map(),
	request: typeof fetch = fetch,
): Promise<PricingTableFetchResult> {
	const results = await Promise.allSettled(
		PRICING_TABLE_SOURCES.map(async (source) => {
			const response = await request(source.sourceUrl, {
				headers: { "User-Agent": "Phaseo pricing table monitor" },
				signal: AbortSignal.timeout(30_000),
			});
			if (!response.ok) throw new Error(`${source.providerName} pricing table returned HTTP ${response.status}`);
			const { text, tableCount } = extractPricingSourceText(await response.text(), source.extraction);
			if (!text) throw new Error(`${source.providerName} pricing table did not contain price-bearing HTML tables`);
			const contentLines = pricingContentLines(text);
			const { added, removed } = diffPricingTableContent(
				previousContentByProvider.get(source.providerId) ?? null,
				contentLines,
			);
			return {
				...source,
				fingerprint: await sha256(text),
				tableCount,
				pricingSamples: extractPricingSamples(text),
				contentLines,
				addedSamples: added.slice(0, MAX_PRICING_SAMPLES),
				removedSamples: removed.slice(0, MAX_PRICING_SAMPLES),
			};
		}),
	);
	const snapshots: PricingTableSnapshot[] = [];
	const errors: string[] = [];
	for (const result of results) {
		if (result.status === "fulfilled") snapshots.push(result.value);
		else errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
	}
	if (snapshots.length === 0) throw new Error(errors.join("; ") || "No pricing tables could be fetched");
	return { snapshots, errors };
}
