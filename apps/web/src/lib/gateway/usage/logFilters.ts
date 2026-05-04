export const LONG_RUNNING_REQUEST_ENDPOINTS = [
	"video.generation",
	"batch",
	"music.generate",
] as const;

export function buildNotInFilter(values: readonly string[]): string {
	return `(${values.map((value) => `"${value}"`).join(",")})`;
}
