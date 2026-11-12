/** URLs carry `openai_gpt-5` for `openai/gpt-5` so the slash doesn't need escaping. */
export function decodeModelIdFromUrl(value: string): string {
	const trimmed = value?.trim();
	if (!trimmed) return "";
	if (trimmed.includes("/")) return trimmed;
	if (!trimmed.includes("_")) return trimmed;
	const [organisationId, ...rest] = trimmed.split("_");
	if (!organisationId || rest.length === 0) return trimmed;
	return `${organisationId}/${rest.join("_")}`;
}

export function encodeModelIdForUrl(value: string): string {
	if (!value) return "";
	const [organisationId, ...rest] = value.split("/");
	if (!organisationId || rest.length === 0) return value;
	return `${organisationId}_${rest.join("/")}`;
}
