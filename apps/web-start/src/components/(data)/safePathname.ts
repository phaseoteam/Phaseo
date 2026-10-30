export function safelyDecodePathSegments(segments: string[]): string | null {
	try {
		return segments.map((segment) => decodeURIComponent(segment)).join("/");
	} catch (error) {
		if (error instanceof URIError) return null;
		throw error;
	}
}
