export const OBFUSCATE_INFO_COOKIE = "obfuscate_info";

// Scramble before blurring: removing the filter must not reveal the original text.
export function obfuscatedPlaceholder(value: string): string {
	const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
	return Array.from(value, (character, index) => {
		if ("@.-_ /•*".includes(character)) return character;
		return alphabet[(index * 17 + value.length * 7) % alphabet.length];
	}).join("");
}

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
