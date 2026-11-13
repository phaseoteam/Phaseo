const summaryFields = ["title", "path", "file_path", "url", "command", "query", "name"];

/** A tool row's one-line detail. Arguments that arrive as JSON would otherwise show only their opening brace. */
export function activitySummary(text: string) {
	const first = text.split("\n")[0] ?? "";
	if (!/^\s*[{[]\s*$/.test(first) && !/^\s*\{"/.test(first)) return first;
	try {
		const value: unknown = JSON.parse(text);
		if (!value || typeof value !== "object" || Array.isArray(value)) return "";
		const record = value as Record<string, unknown>;
		const field = summaryFields.find(key => typeof record[key] === "string" && (record[key] as string).trim());
		return field ? (record[field] as string).trim().split("\n")[0] : "";
	} catch { return ""; }
}
