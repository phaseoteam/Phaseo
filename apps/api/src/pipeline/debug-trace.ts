// Purpose: Build debug traces for request/response transformations.
// Why: Provide detailed field-level diffs for debugging provider adapters.
// How: Computes shallow/deep diffs with redaction for sensitive payloads.

type DebugTraceEntry = {
	stage: string;
	action: "added" | "removed" | "changed" | "moved" | "note";
	path: string;
	before?: unknown;
	after?: unknown;
	note?: string;
	from?: string;
	to?: string;
};

const REDACT_PATH_PARTS = new Set([
	"messages",
	"message",
	"content",
	"input",
	"prompt",
	"text",
	"audio",
	"image",
	"video",
	"tools",
	"tool",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object") return false;
	return Object.prototype.toString.call(value) === "[object Object]";
}

function shouldRedact(path: string[]): boolean {
	return path.some((part) => REDACT_PATH_PARTS.has(part));
}

function redactValue(path: string[], value: unknown): unknown {
	if (!shouldRedact(path)) return value;
	if (Array.isArray(value)) return `[redacted array length=${value.length}]`;
	if (isPlainObject(value)) return "[redacted object]";
	return "[redacted]";
}

function stableStringify(value: unknown): string {
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableStringify(entry)).join(",")} ]`;
	}
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
}

function buildSignature(value: unknown): string {
	try {
		return stableStringify(value);
	} catch {
		return "[unserializable]";
	}
}

function pathToString(path: string[]): string {
	return path.length ? path.join(".") : "$";
}

function diffValues(
	before: unknown,
	after: unknown,
	path: string[],
	entries: DebugTraceEntry[],
	options: { traceLevel: "summary" | "full" }
) {
	const beforeExists = before !== undefined;
	const afterExists = after !== undefined;

	if (!beforeExists && !afterExists) return;

	if (!beforeExists && afterExists) {
		entries.push({
			stage: "",
			action: "added",
			path: pathToString(path),
			before: options.traceLevel === "full" ? undefined : undefined,
			after: options.traceLevel === "full" ? redactValue(path, after) : undefined,
		});
		return;
	}
	if (beforeExists && !afterExists) {
		entries.push({
			stage: "",
			action: "removed",
			path: pathToString(path),
			before: options.traceLevel === "full" ? redactValue(path, before) : undefined,
			after: options.traceLevel === "full" ? undefined : undefined,
		});
		return;
	}

	if (shouldRedact(path)) {
		const beforeSig = buildSignature(before);
		const afterSig = buildSignature(after);
		if (beforeSig === afterSig) return;
		entries.push({
			stage: "",
			action: "changed",
			path: pathToString(path),
			before: options.traceLevel === "full" ? redactValue(path, before) : undefined,
			after: options.traceLevel === "full" ? redactValue(path, after) : undefined,
		});
		return;
	}

	if (Array.isArray(before) || Array.isArray(after)) {
		const beforeSig = buildSignature(before);
		const afterSig = buildSignature(after);
		if (beforeSig === afterSig) return;
		entries.push({
			stage: "",
			action: "changed",
			path: pathToString(path),
			before: options.traceLevel === "full" ? redactValue(path, before) : undefined,
			after: options.traceLevel === "full" ? redactValue(path, after) : undefined,
		});
		return;
	}

	if (isPlainObject(before) && isPlainObject(after)) {
		const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
		for (const key of keys) {
			diffValues(before[key], after[key], [...path, key], entries, options);
		}
		return;
	}

	const beforeSig = buildSignature(before);
	const afterSig = buildSignature(after);
	if (beforeSig === afterSig) return;
	entries.push({
		stage: "",
		action: "changed",
		path: pathToString(path),
		before: options.traceLevel === "full" ? redactValue(path, before) : undefined,
		after: options.traceLevel === "full" ? redactValue(path, after) : undefined,
	});
}

function markMoves(entries: DebugTraceEntry[]): DebugTraceEntry[] {
	const removed = new Map<string, DebugTraceEntry[]>();
	const added = new Map<string, DebugTraceEntry[]>();

	for (const entry of entries) {
		if (entry.action === "removed" && entry.before !== undefined) {
			const sig = buildSignature(entry.before);
			if (!removed.has(sig)) removed.set(sig, []);
			removed.get(sig)!.push(entry);
		}
		if (entry.action === "added" && entry.after !== undefined) {
			const sig = buildSignature(entry.after);
			if (!added.has(sig)) added.set(sig, []);
			added.get(sig)!.push(entry);
		}
	}

	const moved: DebugTraceEntry[] = [];
	for (const [sig, removedEntries] of removed.entries()) {
		const addedEntries = added.get(sig);
		if (!addedEntries || addedEntries.length === 0) continue;
		const count = Math.min(removedEntries.length, addedEntries.length);
		for (let i = 0; i < count; i++) {
			const fromEntry = removedEntries[i];
			const toEntry = addedEntries[i];
			moved.push({
				stage: fromEntry.stage,
				action: "moved",
				path: toEntry.path,
				from: fromEntry.path,
				to: toEntry.path,
				before: fromEntry.before,
				after: toEntry.after,
			});
			fromEntry.action = "note";
			toEntry.action = "note";
			fromEntry.note = "moved";
			toEntry.note = "moved";
		}
	}

	const filtered = entries.filter((entry) => entry.action !== "note" || entry.note !== "moved");
	return [...filtered, ...moved];
}

export function buildTrace(
	stage: string,
	before: unknown,
	after: unknown,
	options?: { traceLevel?: "summary" | "full" }
): DebugTraceEntry[] {
	const traceLevel = options?.traceLevel ?? "full";
	const entries: DebugTraceEntry[] = [];
	if (before === undefined && after === undefined) {
		return [{ stage, action: "note", path: "$", note: "missing input" }];
	}
	diffValues(before, after, [], entries, { traceLevel });
	const withMoves = markMoves(entries);
	for (const entry of withMoves) {
		entry.stage = stage;
	}
	return withMoves;
}

export function safeJsonParse(value: unknown): unknown {
	if (typeof value !== "string") return value;
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}
