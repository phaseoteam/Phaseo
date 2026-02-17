// Purpose: Adaptive retry policy for OpenAI-compatible providers.
// Why: Providers vary in strictness and parameter support even on OpenAI-like APIs.
// How: Parse upstream validation errors, drop/reshape offending params, retry safely.

type OpenAICompatRoute = "responses" | "chat" | "legacy_completions";

type ErrorPayloadLike = Record<string, any> | null;

type AdaptRequestArgs = {
	providerId: string;
	route: OpenAICompatRoute;
	request: Record<string, any>;
	errorText: string;
	errorPayload: ErrorPayloadLike;
};

type AdaptRequestResult = {
	request: Record<string, any>;
	changed: boolean;
	dropped: string[];
};

function normalizeKeyPath(raw: string): string {
	let value = raw.trim();
	if (!value) return "";
	// JSON pointer style.
	if (value.startsWith("/")) {
		value = value.slice(1).replaceAll("/", ".");
	}
	// Remove wrapping quotes.
	value = value.replace(/^["'`]+|["'`]+$/g, "");
	// Remove trailing punctuation from free-form error messages.
	value = value.replace(/[.,:;]+$/g, "");
	// Collapse duplicate dots.
	value = value.replace(/\.+/g, ".");
	// Normalize "messages[0].name" for path parser.
	return value;
}

function tokenizePath(path: string): Array<string | number> {
	const tokens: Array<string | number> = [];
	const source = normalizeKeyPath(path);
	if (!source) return tokens;

	const re = /([^[.\]]+)|\[(\d+)\]/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(source)) !== null) {
		if (match[1]) {
			tokens.push(match[1]);
		} else if (match[2]) {
			tokens.push(Number(match[2]));
		}
	}
	return tokens;
}

function deletePath(target: any, path: string): boolean {
	const tokens = tokenizePath(path);
	if (tokens.length === 0) return false;

	let node: any = target;
	for (let i = 0; i < tokens.length - 1; i += 1) {
		const key = tokens[i]!;
		if (node == null || typeof node !== "object" || !(key in node)) {
			return false;
		}
		node = node[key as any];
	}

	const last = tokens[tokens.length - 1]!;
	if (node == null || typeof node !== "object" || !(last in node)) {
		return false;
	}
	delete node[last as any];
	return true;
}

function toSnakeCase(value: string): string {
	return value
		.replace(/\[(\d+)\]/g, ".$1")
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/-/g, "_")
		.toLowerCase();
}

function toCamelCase(value: string): string {
	return value.replace(/_([a-z0-9])/g, (_, c) => String(c).toUpperCase());
}

function candidatePathsForKey(rawKey: string): string[] {
	const key = normalizeKeyPath(rawKey);
	if (!key) return [];

	const firstSegment = key.split(".")[0] ?? key;
	const snake = toSnakeCase(key);
	const camel = toCamelCase(snake);
	const firstSnake = toSnakeCase(firstSegment);
	const firstCamel = toCamelCase(firstSnake);

	return Array.from(
		new Set([
			key,
			firstSegment,
			snake,
			camel,
			firstSnake,
			firstCamel,
		]),
	);
}

function collectErrorMessages(errorPayload: ErrorPayloadLike): string[] {
	if (!errorPayload || typeof errorPayload !== "object") return [];

	const messages: string[] = [];
	const pushMaybe = (value: unknown) => {
		if (typeof value === "string" && value.trim().length > 0) {
			messages.push(value.trim());
		}
	};

	pushMaybe(errorPayload.message);
	pushMaybe((errorPayload as any).detail);
	pushMaybe((errorPayload as any).error_description);

	const openAIError = (errorPayload as any).error;
	if (openAIError && typeof openAIError === "object") {
		pushMaybe(openAIError.message);
		pushMaybe(openAIError.param);
	}

	const details = Array.isArray((errorPayload as any).details)
		? (errorPayload as any).details
		: Array.isArray((errorPayload as any).errors)
			? (errorPayload as any).errors
			: [];
	for (const entry of details) {
		if (!entry || typeof entry !== "object") continue;
		pushMaybe((entry as any).message);
		pushMaybe((entry as any).msg);
		if (Array.isArray((entry as any).path)) {
			pushMaybe((entry as any).path.join("."));
		}
		if (Array.isArray((entry as any).loc)) {
			pushMaybe((entry as any).loc.join("."));
		}
		pushMaybe((entry as any).field);
		pushMaybe((entry as any).param);
	}

	return messages;
}

function extractParamCandidates(errorText: string, errorPayload: ErrorPayloadLike): string[] {
	const out = new Set<string>();
	const isUnsupportedMessage = (message: string): boolean => {
		const lower = message.toLowerCase();
		return (
			lower.includes("unsupported") ||
			lower.includes("unknown parameter") ||
			lower.includes("unknown field") ||
			lower.includes("not supported") ||
			lower.includes("additional property") ||
			lower.includes("extra input") ||
			lower.includes("extra field") ||
			lower.includes("extra key") ||
			lower.includes("unrecognized")
		);
	};

	const add = (value: unknown) => {
		if (typeof value !== "string") return;
		const key = normalizeKeyPath(value);
		if (!key) return;
		out.add(key);
	};

	if (errorPayload && typeof errorPayload === "object") {
		add((errorPayload as any).param);
		add((errorPayload as any).field);
		add((errorPayload as any).error?.param);

		const detailItems = Array.isArray((errorPayload as any).details)
			? (errorPayload as any).details
			: Array.isArray((errorPayload as any).errors)
				? (errorPayload as any).errors
				: [];
		for (const entry of detailItems) {
			if (!entry || typeof entry !== "object") continue;
			const keyword = String((entry as any).keyword ?? "").toLowerCase();
			const message = String((entry as any).message ?? (entry as any).msg ?? "");
			const detailSignalsUnsupported =
				keyword.includes("unsupported") ||
				keyword.includes("unknown") ||
				keyword.includes("extra") ||
				isUnsupportedMessage(message);
			if (!detailSignalsUnsupported) continue;
			add((entry as any).field);
			add((entry as any).param);
			if (Array.isArray((entry as any).path)) add((entry as any).path.join("."));
			if (Array.isArray((entry as any).loc)) add((entry as any).loc.join("."));
		}
	}

	const combined = [errorText, ...collectErrorMessages(errorPayload)].join("\n");
	const patterns: RegExp[] = [
		/(?:unsupported|unknown|invalid)\s+(?:parameter|field|argument|key)\s*[:=]?\s*["'`]?([a-zA-Z0-9_.\[\]-]+)["'`]?/gi,
		/additional property\s*["'`]?([a-zA-Z0-9_.\[\]-]+)["'`]?/gi,
		/extra(?:\s+inputs?|\s+fields?)?.*?["'`]{1}([a-zA-Z0-9_.\[\]-]+)["'`]{1}/gi,
		/["'`]{1}([a-zA-Z0-9_.\[\]-]+)["'`]{1}\s+is\s+not\s+supported/gi,
		/not\s+support(?:ed)?\s*[:=]?\s*["'`]?([a-zA-Z0-9_.\[\]-]+)["'`]?/gi,
	];

	for (const re of patterns) {
		let match: RegExpExecArray | null;
		while ((match = re.exec(combined)) !== null) {
			add(match[1]);
		}
	}

	return Array.from(out).filter((value) => value.length > 0);
}

function mapAliasForKnownError(next: Record<string, any>, errorLower: string, dropped: string[]): boolean {
	let changed = false;

	if (
		errorLower.includes("max_completion_tokens") &&
		(errorLower.includes("unsupported") || errorLower.includes("unknown")) &&
		typeof next.max_completion_tokens === "number"
	) {
		if (next.max_tokens == null) {
			next.max_tokens = next.max_completion_tokens;
		}
		delete next.max_completion_tokens;
		dropped.push("max_completion_tokens");
		changed = true;
	}

	if (
		errorLower.includes("max_tokens") &&
		(errorLower.includes("unsupported") || errorLower.includes("unknown")) &&
		typeof next.max_tokens === "number"
	) {
		if (next.max_completion_tokens == null) {
			next.max_completion_tokens = next.max_tokens;
		}
		delete next.max_tokens;
		dropped.push("max_tokens");
		changed = true;
	}

	if (
		errorLower.includes("input_items") &&
		(errorLower.includes("unsupported") || errorLower.includes("unknown")) &&
		next.input_items != null &&
		next.input == null
	) {
		next.input = next.input_items;
		delete next.input_items;
		dropped.push("input_items");
		changed = true;
	}

	if (
		!errorLower.includes("input_items") &&
		errorLower.includes("input") &&
		(errorLower.includes("unsupported") || errorLower.includes("unknown")) &&
		next.input != null &&
		next.input_items == null
	) {
		next.input_items = next.input;
		delete next.input;
		dropped.push("input");
		changed = true;
	}

	return changed;
}

export function adaptRequestFromUpstreamError(args: AdaptRequestArgs): AdaptRequestResult {
	const next: Record<string, any> = JSON.parse(JSON.stringify(args.request));
	const dropped: string[] = [];
	let changed = false;
	const errorLower = args.errorText.toLowerCase();

	// Apply known token/input alias rewrites before generic key dropping.
	if (mapAliasForKnownError(next, errorLower, dropped)) {
		changed = true;
	}

	const shouldDropByValidationSignal =
		errorLower.includes("unsupported") ||
		errorLower.includes("unknown parameter") ||
		errorLower.includes("unknown field") ||
		errorLower.includes("not supported") ||
		errorLower.includes("additional property") ||
		errorLower.includes("extra input") ||
		errorLower.includes("extra field") ||
		errorLower.includes("extra key") ||
		errorLower.includes("unrecognized");
	if (!shouldDropByValidationSignal) {
		return {
			request: next,
			changed,
			dropped: Array.from(new Set(dropped)),
		};
	}

	const candidates = extractParamCandidates(args.errorText, args.errorPayload);
	for (const rawKey of candidates) {
		for (const path of candidatePathsForKey(rawKey)) {
			if (!path) continue;
			if (deletePath(next, path)) {
				dropped.push(path);
				changed = true;
			}
		}
	}

	return {
		request: next,
		changed,
		dropped: Array.from(new Set(dropped)),
	};
}

export function shouldFallbackToChatFromError(args: {
	route: OpenAICompatRoute;
	status: number;
	errorText: string;
}): boolean {
	if (args.route !== "responses") return false;
	if (args.status === 404 || args.status === 405 || args.status === 501) return true;

	const text = args.errorText.toLowerCase();
	if (!text) return false;

	return (
		text.includes("/responses") ||
		text.includes("responses endpoint") ||
		text.includes("unknown endpoint") ||
		text.includes("unknown path") ||
		text.includes("not found") ||
		text.includes("does not support responses")
	);
}

export async function readErrorPayload(response: Response): Promise<{ errorText: string; errorPayload: ErrorPayloadLike }> {
	try {
		const text = await response.clone().text();
		if (!text) return { errorText: "", errorPayload: null };

		try {
			return { errorText: text, errorPayload: JSON.parse(text) as Record<string, any> };
		} catch {
			return { errorText: text, errorPayload: null };
		}
	} catch {
		return { errorText: "", errorPayload: null };
	}
}
