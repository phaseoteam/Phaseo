const ANTHROPIC_PUBLIC_TO_NATIVE: Record<string, string> = {
	"claude-3.5-haiku": "claude-3-5-haiku-20241022",
	"claude-haiku-4.5": "claude-haiku-4-5-20251001",
	"claude-opus-4.5": "claude-opus-4-5",
	"claude-sonnet-4.5": "claude-sonnet-4-5-20250929",
	"claude-sonnet-4.6": "claude-sonnet-4-6",
};

const MISTRAL_PUBLIC_TO_NATIVE: Record<string, string> = {
	"mistral-small-4": "mistral-small-2603",
};

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function stripProviderPrefix(providerId: string, model: string): string {
	const lower = model.toLowerCase();
	const prefixes: Record<string, string[]> = {
		openai: ["openai/"],
		anthropic: ["anthropic/"],
		"google-ai-studio": ["google/", "gemini/"],
		mistral: ["mistral/"],
		"x-ai": ["x-ai/", "xai/", "spacex-ai/"],
		groq: ["groq/"],
		together: ["together/", "together-ai/"],
	};
	for (const prefix of prefixes[providerId] ?? []) {
		if (lower.startsWith(prefix)) return model.slice(prefix.length);
	}
	return model;
}

function anthropicNativeFromPublicTail(tail: string): string {
	return ANTHROPIC_PUBLIC_TO_NATIVE[tail] ?? tail;
}

function anthropicPublicTailFromNative(tail: string): string | null {
	const direct = Object.entries(ANTHROPIC_PUBLIC_TO_NATIVE)
		.find(([, native]) => native === tail)?.[0];
	if (direct) return direct;

	const haiku45 = tail.match(/^claude-haiku-(\d+)-(\d+)-\d{8}$/u);
	if (haiku45) return `claude-haiku-${haiku45[1]}.${haiku45[2]}`;

	const sonnet4Dated = tail.match(/^claude-sonnet-(\d+)-(\d+)-\d{8}$/u);
	if (sonnet4Dated) return `claude-sonnet-${sonnet4Dated[1]}.${sonnet4Dated[2]}`;

	const sonnet4Alias = tail.match(/^claude-sonnet-(\d+)-(\d+)$/u);
	if (sonnet4Alias) return `claude-sonnet-${sonnet4Alias[1]}.${sonnet4Alias[2]}`;

	const claude35 = tail.match(/^claude-(\d+)-(\d+)-(.+)-\d{8}$/u);
	if (claude35) return `claude-${claude35[1]}.${claude35[2]}-${claude35[3]}`;

	const claude3 = tail.match(/^claude-(\d+)-(.+)-\d{8}$/u);
	if (claude3) return `claude-${claude3[1]}-${claude3[2]}`;

	return null;
}

export function toProviderNativeBatchModelId(providerId: string, model: string): string {
	const trimmed = model.trim();
	const tail = stripProviderPrefix(providerId, trimmed);
	if (providerId === "anthropic") return anthropicNativeFromPublicTail(tail);
	if (providerId === "mistral") return MISTRAL_PUBLIC_TO_NATIVE[tail] ?? tail;
	return tail;
}

export function resolveBatchPricingProviderCandidates(providerId: string): string[] {
	const normalized = providerId.trim().toLowerCase();
	if (normalized === "x-ai" || normalized === "xai" || normalized === "spacex-ai") {
		return ["spacex-ai", "x-ai"];
	}
	return [providerId];
}

export function resolveBatchPricingModelCandidates(providerId: string, model: unknown): string[] {
	const trimmed = normalizeText(model);
	if (!trimmed) return [];
	const candidates: string[] = [];
	const add = (candidate: string | null | undefined) => {
		const value = normalizeText(candidate);
		if (value && !candidates.includes(value)) candidates.push(value);
	};

	add(trimmed);
	if (!trimmed.includes("/")) add(`${providerId}/${trimmed}`);
	if (providerId === "google-ai-studio") {
		add(`google/${stripProviderPrefix(providerId, trimmed)}`);
	}
	if (providerId === "x-ai") {
		add(`spacex-ai/${stripProviderPrefix(providerId, trimmed)}`);
	}
	if (providerId === "mistral") {
		const tail = stripProviderPrefix(providerId, trimmed).replace(/-batch$/u, "");
		add(tail);
		add(`mistral/${tail}`);
		const publicTail = Object.entries(MISTRAL_PUBLIC_TO_NATIVE)
			.find(([, native]) => native === tail)?.[0];
		if (publicTail) add(`mistral/${publicTail}`);
	}

	if (providerId === "anthropic") {
		const tail = stripProviderPrefix(providerId, trimmed);
		const publicTail = anthropicPublicTailFromNative(tail);
		if (publicTail) add(`anthropic/${publicTail}`);
	}

	const stripped = trimmed.replace(/-\d{4}-\d{2}-\d{2}$/u, "");
	if (stripped !== trimmed) {
		add(stripped);
		if (!stripped.includes("/")) add(`${providerId}/${stripped}`);
	}
	if (trimmed.includes("/")) {
		const [prefix, ...rest] = trimmed.split("/");
		const tail = rest.join("/");
		const strippedTail = tail.replace(/-\d{4}-\d{2}-\d{2}$/u, "");
		if (strippedTail !== tail) add(`${prefix}/${strippedTail}`);
	}
	return candidates;
}
