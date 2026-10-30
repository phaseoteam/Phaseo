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

const SAFE_IMAGE_DATA_URL_PATTERN =
	/^data:image\/(?:png|jpeg|jpg|webp|gif|bmp|avif);base64,[a-z0-9+/=\s]+$/i;

export function normalizePlaygroundMediaUrl(
	input: unknown,
	options?: { allowImageData?: boolean },
): string | null {
	if (typeof input !== "string") return null;

	const trimmed = input.trim();
	if (!trimmed) return null;

	if (
		options?.allowImageData &&
		SAFE_IMAGE_DATA_URL_PATTERN.test(trimmed)
	) {
		return trimmed.replace(/\s+/g, "");
	}

	return normalizeHttpUrl(trimmed);
}
