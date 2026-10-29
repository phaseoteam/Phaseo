import { normalized, type PricingRuleOptions } from "./catalogue-sync-shared";

export type OfficialPriceCandidate = {
	providerModel: string;
	capabilityId?: string;
	currency?: "USD" | "CNY";
	meters: Record<string, number>;
	ruleOptions?: Record<string, PricingRuleOptions>;
};

function decodeHtml(value: string): string {
	return value
		.replace(/&nbsp;|&#160;/gi, " ")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&quot;/gi, '"')
		.replace(/&amp;/gi, "&");
}

function cellText(value: string): string {
	return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function extractHtmlTableRows(html: string): string[][][] {
	return Array.from(html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi), (table) =>
		Array.from(table[1]!.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), (row) =>
			Array.from(row[1]!.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi), (cell) => cellText(cell[1]!)),
		).filter((row) => row.length > 0),
	).filter((table) => table.length > 0);
}

function usd(value: string): number | null {
	const match = value.match(/\$\s*(\d+(?:\.\d+)?)/);
	if (!match) return null;
	const parsed = Number(match[1]);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function cny(value: string): number | null {
	const match = value.match(/(\d+(?:\.\d+)?)\s*(?:元|CNY|RMB)/i);
	if (!match) return null;
	const parsed = Number(match[1]);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function meterForHeader(header: string): string | null {
	const value = normalized(header);
	if (value.includes("storage")) return null;
	if (value.includes("5m cache") || value.includes("5-minute cache")) return "cached_write_text_tokens_5m";
	if (value.includes("1h cache") || value.includes("1-hour cache")) return "cached_write_text_tokens_1h";
	if (value.includes("cache hit") || value.includes("cached input")) return "cached_read_text_tokens";
	if (value.includes("output")) return "output_text_tokens";
	if (value.includes("input")) return "input_text_tokens";
	return null;
}

function horizontalCandidates(tables: string[][][]): OfficialPriceCandidate[] {
	const candidates: OfficialPriceCandidate[] = [];
	for (const table of tables) {
		const headerIndex = table.findIndex((row) => {
			const headers = row.map(normalized);
			return headers.some((value) => value === "model" || value.includes("model string"))
				&& headers.some((value) => value.includes("input"))
				&& headers.some((value) => value.includes("output"));
		});
		if (headerIndex < 0) continue;
		const headers = table[headerIndex]!;
		if (headers.some((header) => /short context|long context|training|batch/i.test(header))) continue;
		const modelIndex = headers.findIndex((header) => {
			const value = normalized(header);
			return value.includes("api model string") || value.includes("model string for api");
		});
		const fallbackModelIndex = headers.findIndex((header) => normalized(header) === "model" || normalized(header).startsWith("model "));
		const resolvedModelIndex = modelIndex >= 0 ? modelIndex : fallbackModelIndex;
		if (resolvedModelIndex < 0) continue;
		const meterColumns = headers.flatMap((header, index) => {
			const meter = meterForHeader(header);
			return meter ? [{ index, meter }] : [];
		});
		if (new Set(meterColumns.map((column) => column.meter)).size !== meterColumns.length) continue;
		for (const row of table.slice(headerIndex + 1)) {
			const providerModel = row[resolvedModelIndex]?.trim();
			if (!providerModel) continue;
			const meters = Object.fromEntries(meterColumns.flatMap(({ index, meter }) => {
				const price = usd(row[index] ?? "");
				return price === null ? [] : [[meter, price]];
			}));
			if (meters.input_text_tokens !== undefined && meters.output_text_tokens !== undefined) {
				candidates.push({ providerModel, meters });
			}
		}
	}
	return candidates;
}

function markdownText(value: string): string {
	return value
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replaceAll("**", "")
		.replaceAll("`", "")
		.trim();
}

function effectiveOn(label: string, now: Date): boolean {
	const through = label.match(/\bthrough ([A-Z][a-z]+ \d{1,2}, \d{4})/i)?.[1];
	if (through !== undefined && now.getTime() > Date.parse(`${through} 23:59:59 UTC`)) return false;
	const starting = label.match(/\bstarting ([A-Z][a-z]+ \d{1,2}, \d{4})/i)?.[1];
	if (starting !== undefined && now.getTime() < Date.parse(`${starting} 00:00:00 UTC`)) return false;
	return true;
}

function markdownPrice(value: string): number | null {
	const match = markdownText(value).match(/\$([\d.]+)\s*\/\s*MTok/i);
	if (!match) return null;
	const parsed = Number(match[1]);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function anthropicMarkdownCandidates(markdown: string, now = new Date()): OfficialPriceCandidate[] {
	const section = markdown.split(/^## Model pricing\s*$/m)[1]?.split(/^## /m)[0];
	if (section === undefined) return [];
	const rows = section.split("\n")
		.filter((line) => line.trimStart().startsWith("|"))
		.map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
	const header = rows[0]?.map(markdownText);
	if (!header) return [];
	const indexes = {
		model: header.indexOf("Model"),
		input: header.indexOf("Base Input Tokens"),
		cacheWrite: header.indexOf("5m Cache Writes"),
		cacheRead: header.indexOf("Cache Hits & Refreshes"),
		output: header.indexOf("Output Tokens"),
	};
	if (Object.values(indexes).some((index) => index < 0)) return [];
	return rows.slice(2).flatMap((row) => {
		const providerModel = markdownText(row[indexes.model] ?? "");
		if (!providerModel || !effectiveOn(providerModel, now)) return [];
		const input = markdownPrice(row[indexes.input] ?? "");
		const cacheWrite = markdownPrice(row[indexes.cacheWrite] ?? "");
		const cacheRead = markdownPrice(row[indexes.cacheRead] ?? "");
		const output = markdownPrice(row[indexes.output] ?? "");
		if (input === null || cacheWrite === null || cacheRead === null || output === null) return [];
		return [{
			providerModel,
			meters: {
				input_text_tokens: input,
				cached_write_text_tokens_5m: cacheWrite,
				cached_read_text_tokens: cacheRead,
				output_text_tokens: output,
			},
		}];
	});
}

function deepseekCandidates(tables: string[][][]): OfficialPriceCandidate[] {
	const candidates: OfficialPriceCandidate[] = [];
	for (const table of tables) {
		const modelRow = table.find((row) => normalized(row[0]) === "model" && row.length > 1);
		if (!modelRow) continue;
		const inputHit = table.find((row) => /input tokens.*cache hit/i.test(row[0] ?? ""));
		const inputMiss = table.find((row) => /input tokens.*cache miss/i.test(row[0] ?? ""));
		const output = table.find((row) => /output tokens/i.test(row[0] ?? ""));
		if (!inputMiss || !output) continue;
		for (let index = 1; index < modelRow.length; index += 1) {
			const input = usd(inputMiss[index] ?? "");
			const outputPrice = usd(output[index] ?? "");
			if (input === null || outputPrice === null) continue;
			const cache = inputHit ? usd(inputHit[index] ?? "") : null;
			candidates.push({
				providerModel: modelRow[index]!,
				meters: {
					input_text_tokens: input,
					...(cache === null ? {} : { cached_read_text_tokens: cache }),
					output_text_tokens: outputPrice,
				},
			});
		}
	}
	return candidates;
}

function moonshotCandidates(markdown: string): OfficialPriceCandidate[] {
	const rowsBlock = markdown.match(/rows=\{\[([\s\S]*?)\]\}/)?.[1] ?? "";
	return Array.from(rowsBlock.matchAll(/\[\s*"([^"]+)"[^\]]*?<>\s*\{["']\$["']\}(\d+(?:\.\d+)?)<\/\>[^\]]*?<>\s*\{["']\$["']\}(\d+(?:\.\d+)?)<\/\>[^\]]*?<>\s*\{["']\$["']\}(\d+(?:\.\d+)?)<\/\>/g), (match) => ({
		providerModel: match[1]!,
		meters: {
			cached_read_text_tokens: Number(match[2]),
			input_text_tokens: Number(match[3]),
			output_text_tokens: Number(match[4]),
		},
	}));
}

function fireworksCandidates(tables: string[][][]): OfficialPriceCandidate[] {
	const table = tables.find((value) => normalized(value[0]?.[0]) === "model" && normalized(value[0]?.[1]) === "standard");
	if (!table) return [];
	return table.slice(1).flatMap((row) => {
		const prices = Array.from((row[1] ?? "").matchAll(/\$\s*(\d+(?:\.\d+)?)/g), (match) => Number(match[1]));
		if (!row[0] || prices.length !== 3) return [];
		return [{
			providerModel: row[0],
			meters: {
				input_text_tokens: prices[0]!,
				cached_read_text_tokens: prices[1]!,
				output_text_tokens: prices[2]!,
			},
		}];
	});
}

function voyageCandidates(tables: string[][][]): OfficialPriceCandidate[] {
	const candidates: OfficialPriceCandidate[] = [];
	for (const table of tables) {
		const headers = table[0]?.map(normalized) ?? [];
		const priceIndex = headers.findIndex((header) => header === "price per million tokens");
		if (priceIndex < 0 || normalized(table[0]?.[0]) !== "model") continue;
		for (const row of table.slice(1)) {
			const price = usd(row[priceIndex] ?? "");
			if (price === null) continue;
			for (const providerModel of (row[0] ?? "").split(/\s+/).filter(Boolean)) {
				const rerank = providerModel.startsWith("rerank-");
				candidates.push({
					providerModel,
					capabilityId: rerank ? "text.rerank" : "text.embed",
					meters: { input_text_tokens: price },
				});
			}
		}
	}
	return candidates;
}

function weightsAndBiasesCandidates(tables: string[][][]): OfficialPriceCandidate[] {
	const headerIndex = tables.findIndex((table) => {
		const headers = table[0]?.map(normalized) ?? [];
		return headers.join("|") === "model|input tokens|output tokens|cache hit";
	});
	if (headerIndex < 0) return [];
	const body = tables.slice(headerIndex + 1).find((table) => table.some((row) => row.length === 4));
	if (!body) return [];
	return body.flatMap((row) => {
		const input = usd(row[1] ?? "");
		const output = usd(row[2] ?? "");
		const cache = usd(row[3] ?? "");
		if (!row[0] || input === null || output === null) return [];
		return [{
			providerModel: row[0].replace(/^(?:Z\.AI|Moonshot AI|NVIDIA|OpenAI|OpenPipe|Google|IBM|JetBrains|Meta|Microsoft)\s+/i, ""),
			meters: {
				input_text_tokens: input,
				output_text_tokens: output,
				...(cache === null ? {} : { cached_read_text_tokens: cache }),
			},
		}];
	});
}

function cloudflareCandidates(tables: string[][][]): OfficialPriceCandidate[] {
	const candidates: OfficialPriceCandidate[] = [];
	for (const table of tables) {
		const headers = table[0]?.map(normalized) ?? [];
		if (headers[0] !== "model" || !headers.some((header) => header.includes("price in tokens"))) continue;
		for (const row of table.slice(1)) {
			const providerModel = row[0]?.trim().replace(/^@cf\//i, "");
			const priceText = row[1] ?? "";
			if (!providerModel || !priceText) continue;
			const input = priceText.match(/\$\s*(\d+(?:\.\d+)?)\s+per\s+m\s+input\s+tokens/i);
			const cached = priceText.match(/\$\s*(\d+(?:\.\d+)?)\s+per\s+m\s+cached\s+input\s+tokens/i);
			const output = priceText.match(/\$\s*(\d+(?:\.\d+)?)\s+per\s+m\s+output\s+tokens/i);
			if (input) {
				candidates.push({
					providerModel,
					capabilityId: output ? "text.generate" : "text.embed",
					meters: {
						input_text_tokens: Number(input[1]),
						...(cached ? { cached_read_text_tokens: Number(cached[1]) } : {}),
						...(output ? { output_text_tokens: Number(output[1]) } : {}),
					},
				});
				continue;
			}
			const audio = priceText.match(/\$\s*(\d+(?:\.\d+)?)\s+per\s+audio\s+minute(?:\s+input)?/i);
			if (audio) {
				candidates.push({
					providerModel,
					capabilityId: "audio.transcribe",
					meters: { input_audio_minutes: Number(audio[1]) },
					ruleOptions: { input_audio_minutes: { unit: "minute", unitSize: 1 } },
				});
			}
		}
	}
	return candidates;
}

function stepfunCandidates(tables: string[][][]): OfficialPriceCandidate[] {
	const candidates: OfficialPriceCandidate[] = [];
	for (const table of tables) {
		const headers = table[0] ?? [];
		const modelIndex = headers.findIndex((header) => normalized(header) === "模型");
		const inputIndex = headers.findIndex((header) => header.includes("输入价格") && header.includes("缓存未命中"));
		const cacheIndex = headers.findIndex((header) => header.includes("输入价格") && header.includes("缓存命中") && !header.includes("未命中"));
		const outputIndex = headers.findIndex((header) => header.includes("输出价格"));
		if ([modelIndex, inputIndex, cacheIndex, outputIndex].some((index) => index < 0)) continue;
		for (const row of table.slice(1)) {
			const input = cny(row[inputIndex] ?? "");
			const cache = cny(row[cacheIndex] ?? "");
			const output = cny(row[outputIndex] ?? "");
			if (!row[modelIndex] || input === null || cache === null || output === null) continue;
			candidates.push({
				providerModel: row[modelIndex]!,
				currency: "CNY",
				meters: {
					input_text_tokens: input,
					cached_read_text_tokens: cache,
					output_text_tokens: output,
				},
			});
		}
	}
	return candidates;
}

function xiaomiCandidates(html: string): OfficialPriceCandidate[] {
	const text = cellText(html.replace(/<(script|style|svg|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " "));
	return Array.from(text.matchAll(/(?:Xiaomi\s+)?(MiMo-[A-Za-z0-9.-]+)(?:(?!MiMo-[A-Za-z0-9.-]+)[\s\S])*?Input \(cache hit\)\s*\$\s*(\d+(?:\.\d+)?)\s*\/\s*MTok(?:(?!MiMo-[A-Za-z0-9.-]+)[\s\S])*?Input \(cache miss\)\s*\$\s*(\d+(?:\.\d+)?)\s*\/\s*MTok(?:(?!MiMo-[A-Za-z0-9.-]+)[\s\S])*?Output\s*\$\s*(\d+(?:\.\d+)?)\s*\/\s*MTok/gi), (match) => ({
		providerModel: match[1]!,
		meters: {
			cached_read_text_tokens: Number(match[2]),
			input_text_tokens: Number(match[3]),
			output_text_tokens: Number(match[4]),
		},
	}));
}

export function extractOfficialPricing(providerId: string, html: string): OfficialPriceCandidate[] {
	if (providerId === "moonshotai") return moonshotCandidates(html);
	if (providerId === "xiaomi") return xiaomiCandidates(html);
	if (providerId === "anthropic" && /^## Model pricing\s*$/m.test(html)) return anthropicMarkdownCandidates(html);
	const tables = extractHtmlTableRows(html);
	if (providerId === "cloudflare") return cloudflareCandidates(tables);
	if (providerId === "deepseek") return deepseekCandidates(tables);
	if (providerId === "fireworks") return fireworksCandidates(tables);
	if (providerId === "stepfun") return stepfunCandidates(tables);
	if (providerId === "voyage") return voyageCandidates(tables);
	if (providerId === "weights-and-biases") return weightsAndBiasesCandidates(tables);
	return horizontalCandidates(tables);
}
