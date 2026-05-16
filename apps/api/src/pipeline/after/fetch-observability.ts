import type {
	ManagedWebFetchObservabilityEntry,
	WebFetchObservability,
} from "../before/types";

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function normalizeEntry(
	entry: ManagedWebFetchObservabilityEntry,
): ManagedWebFetchObservabilityEntry {
	return {
		provider: asString(entry.provider),
		url: asString(entry.url),
		finalUrl: asString(entry.finalUrl),
		title: asString(entry.title),
		status: asNumber(entry.status),
		contentType: asString(entry.contentType),
		returnedChars: Math.max(0, Math.floor(asNumber(entry.returnedChars) ?? 0)),
		truncated: entry.truncated === true,
	};
}

function dedupeEntries(
	entries: ManagedWebFetchObservabilityEntry[],
): ManagedWebFetchObservabilityEntry[] {
	const seen = new Set<string>();
	const out: ManagedWebFetchObservabilityEntry[] = [];
	for (const rawEntry of entries) {
		const entry = normalizeEntry(rawEntry);
		const key = [
			entry.provider ?? "",
			entry.url ?? "",
			entry.finalUrl ?? "",
			entry.title ?? "",
			entry.status ?? "",
			entry.contentType ?? "",
			entry.returnedChars,
			entry.truncated ? "1" : "0",
		].join("|");
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(entry);
		if (out.length >= 10) break;
	}
	return out;
}

export function buildManagedWebFetchObservabilityFromToolResults(
	toolResults: Array<{ content: string; isError?: boolean }>,
): WebFetchObservability | null {
	const entries: ManagedWebFetchObservabilityEntry[] = [];

	for (const toolResult of toolResults) {
		if (toolResult?.isError) continue;
		if (typeof toolResult?.content !== "string" || toolResult.content.trim().length === 0) {
			continue;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(toolResult.content);
		} catch {
			continue;
		}

		const record = asRecord(parsed);
		if (!record) continue;
		if (asString(record.provider) !== "fetch") continue;

		entries.push({
			provider: "fetch",
			url: asString(record.url),
			finalUrl: asString(record.final_url ?? record.finalUrl),
			title: asString(record.title),
			status: asNumber(record.status),
			contentType: asString(record.content_type ?? record.contentType),
			returnedChars: Math.max(0, Math.floor(asNumber(record.returned_chars ?? record.returnedChars) ?? 0)),
			truncated: record.truncated === true,
		});
	}

	if (entries.length === 0) return null;
	const fetches = dedupeEntries(entries);
	return {
		requestCount: fetches.length,
		fetches,
	};
}

export function mergeWebFetchObservability(
	...entries: Array<WebFetchObservability | null | undefined>
): WebFetchObservability | null {
	const usable = entries.filter(
		(entry): entry is WebFetchObservability =>
			Boolean(entry) && Array.isArray(entry?.fetches) && entry.fetches.length > 0,
	);
	if (usable.length === 0) return null;

	const fetches = dedupeEntries(usable.flatMap((entry) => entry.fetches));
	return {
		requestCount: fetches.length,
		fetches,
	};
}
