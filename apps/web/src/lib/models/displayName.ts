const ACRONYM_WORDS = new Set([
	"ai",
	"api",
	"gpt",
	"llm",
	"mpt",
	"vl",
]);

function titleCaseToken(token: string) {
	if (!token) return token;
	if (ACRONYM_WORDS.has(token.toLowerCase())) return token.toUpperCase();
	if (/^[a-z]+\d/i.test(token)) {
		return `${token.charAt(0).toUpperCase()}${token.slice(1)}`;
	}
	return `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`;
}

function labelFromModelId(modelId: string) {
	const leaf = modelId.split("/").filter(Boolean).at(-1) ?? modelId;
	const withVariant = leaf
		.replace(/:free$/iu, " (free)")
		.replace(/:(\d+)$/u, " ($1)");
	const normalized = withVariant
		.replace(/[_-]+/gu, " ")
		.replace(/\s+/gu, " ")
		.trim();

	return normalized
		.split(" ")
		.map((token) =>
			token.startsWith("(") && token.endsWith(")")
				? token
				: titleCaseToken(token),
		)
		.join(" ");
}

export function formatModelDisplayName(
	name: string | null | undefined,
	modelId: string,
) {
	const candidate = String(name ?? "").trim();
	const base = candidate || labelFromModelId(modelId);
	const formatted = base
		.replace(/:free$/iu, " (free)")
		.replace(/:(\d+)$/u, " ($1)");
	if (/:free$/iu.test(modelId) && !/\(\s*free\s*\)$/iu.test(formatted)) {
		return `${formatted} (free)`;
	}
	const numericVariant = modelId.match(/:(\d+)$/u)?.[1];
	if (
		numericVariant &&
		!new RegExp(`\\(\\s*${numericVariant}\\s*\\)$`, "u").test(formatted)
	) {
		return `${formatted} (${numericVariant})`;
	}
	return formatted;
}
