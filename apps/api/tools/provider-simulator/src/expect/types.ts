// Purpose: Shared contract for expected outcomes, mismatches and the allow-list.
// Why: Every layer (executor, end-to-end, pricing) must report mismatches the same way so one gate can judge them.
// How: Expectations carry a cited source; mismatches carry a fixed kind; the allow-list matches mismatches by pattern.

/** Where an expectation comes from. Every expectation must have one. */
export type Source =
	/** A provider's API spec, cached under specs/. `path` is a JSON pointer or schema path inside it. */
	| { kind: "spec"; spec: string; path: string }
	/** A provider's documentation page. */
	| { kind: "docs"; url: string; note?: string }
	/** Phaseo's own public docs (gateway semantics). `page` is a path under apps/docs. */
	| { kind: "gateway-docs"; page: string; note?: string }
	/** Documentation is silent; the expectation is a judgement call. `reason` must say why. */
	| { kind: "assumed"; reason: string }
	/** A named citation in expectations/sources.json. */
	| { kind: "ref"; ref: string };

export type MismatchKind =
	/** Expected field or event is missing. */
	| "dropped"
	/** Field or event present that nothing asked for. */
	| "invented"
	/** Expected value present under another name or path. */
	| "renamed"
	| "wrong_value"
	| "wrong_type"
	/** Billed more than expected. `delta.nanos` / `delta.tokens` are positive. */
	| "billing_over"
	/** Billed less than expected. `delta.nanos` / `delta.tokens` are negative. */
	| "billing_under"
	| "stream_order"
	| "error_mapping"
	| "nondeterminism";

export const MISMATCH_KINDS: MismatchKind[] = [
	"dropped", "invented", "renamed", "wrong_value", "wrong_type",
	"billing_over", "billing_under", "stream_order", "error_mapping", "nondeterminism",
];

export type Layer = "executor" | "e2e" | "pricing";

/** Endpoint family: "text" or a non-text capability such as "embeddings", "audio.speech". */
export type Family = string;

export type Mismatch = {
	layer: Layer;
	kind: MismatchKind;
	provider: string;
	family: Family;
	model?: string;
	/** Client surface, e.g. "chat", "responses", "messages", "embeddings". */
	surface?: string;
	mode?: "stream" | "buffered";
	/** Stable case id, e.g. "chat.param.temperature", "resp:max", "failover:500-then-ok". */
	caseId: string;
	/** What is compared: "upstream.url", "upstream.body.$.temperature", "client.usage.prompt_tokens", "billing.meter.cached_read_text_tokens", ... */
	path: string;
	expected?: unknown;
	actual?: unknown;
	delta?: { nanos?: number; tokens?: number; meter?: string };
	source: Source;
	note?: string;
	/** Set by the allow-list. */
	allowed?: { id: string; justification: string };
};

/** An allow-list entry. Every field in `match` must match; strings are exact unless they start with "re:" (regex). */
export type AllowEntry = {
	id: string;
	/** Why this mismatch is acceptable or known. Required, at least a sentence. */
	justification: string;
	/** AUDIT.md finding id, or "by-design". */
	finding: string;
	/** Proposed fix PR group, or "none" for intended behaviour. */
	fixGroup: string;
	match: Partial<Record<"layer" | "kind" | "provider" | "family" | "model" | "surface" | "mode" | "caseId" | "path", string | string[]>>;
};

export type GateSummary = {
	total: number;
	allowed: number;
	failing: number;
	byKind: Record<string, { total: number; failing: number }>;
	byAllowEntry: Record<string, number>;
	unusedAllowEntries: string[];
};
