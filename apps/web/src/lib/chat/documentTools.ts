export function rerankDocuments(value: string): string[] {
	return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function ocrText(value: unknown): string {
	if (!value || typeof value !== "object") return "";
	const result = value as { text?: unknown; pages?: unknown };
	if (typeof result.text === "string" && result.text.trim()) return result.text;
	if (!Array.isArray(result.pages)) return "";
	return result.pages.map((page) => {
		if (!page || typeof page !== "object") return "";
		return typeof page.markdown === "string" ? page.markdown : typeof page.text === "string" ? page.text : "";
	}).filter(Boolean).join("\n\n");
}

export function rankedDocuments(value: unknown, documents: string[]): Array<{ index: number; text: string; score: number | null }> {
	if (!value || typeof value !== "object" || !("results" in value) || !Array.isArray(value.results)) return [];
	return value.results.flatMap((item) => {
		if (!item || typeof item !== "object" || !Number.isInteger(item.index) || item.index < 0 || item.index >= documents.length) return [];
		return [{ index: item.index, text: documents[item.index], score: typeof item.relevance_score === "number" && Number.isFinite(item.relevance_score) ? item.relevance_score : null }];
	});
}
