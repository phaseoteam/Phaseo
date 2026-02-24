export const OBFUSCATE_INFO_COOKIE = "obfuscate_info";
export const OBFUSCATE_INFO_STORAGE_KEY = "ai_stats_obfuscate_info";

export function parseObfuscateInfo(value: unknown): boolean | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim().toLowerCase();
	if (normalized === "1" || normalized === "true") return true;
	if (normalized === "0" || normalized === "false") return false;
	return null;
}

export function serializeObfuscateInfo(enabled: boolean): string {
	return enabled ? "1" : "0";
}
