function looksLikeStackTrace(value: string): boolean {
	return /\n\s*at\s+[^\n]+/i.test(value) || /Error:\s*[^\n]+/i.test(value);
}

function shouldDropKey(key: string): boolean {
	return key === "stack" || key === "stackTrace" || key === "stacktrace";
}

export function sanitizeJsonValue(value: unknown): unknown {
	const seen = new WeakSet<object>();

	const visit = (input: unknown): unknown => {
		if (input instanceof Error) {
			return {
				name: input.name,
			};
		}

		if (typeof input === "string") {
			return looksLikeStackTrace(input) ? "[redacted]" : input;
		}

		if (Array.isArray(input)) {
			return input.map((item) => visit(item));
		}

		if (input && typeof input === "object") {
			if (seen.has(input)) return "[Circular]";
			seen.add(input);

			const sanitized: Record<string, unknown> = {};
			for (const [key, nestedValue] of Object.entries(input)) {
				if (shouldDropKey(key)) continue;
				sanitized[key] = visit(nestedValue);
			}
			return sanitized;
		}

		return input;
	};

	return visit(value);
}

export function sanitizeErrorMessage(value: string): string {
	return looksLikeStackTrace(value) ? "Internal error" : value;
}

export function safeJsonStringify(value: unknown): string {
	return JSON.stringify(sanitizeJsonValue(value), null, 2);
}
