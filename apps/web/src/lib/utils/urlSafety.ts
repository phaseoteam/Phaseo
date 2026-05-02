export function normalizeHttpUrl(input: unknown): string | null {
	if (typeof input !== "string") return null;

	const trimmed = input.trim();
	if (!trimmed) return null;

	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return null;
		}
		return parsed.toString();
	} catch {
		return null;
	}
}
