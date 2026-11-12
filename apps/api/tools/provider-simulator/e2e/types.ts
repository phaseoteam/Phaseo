// Purpose: Types shared by the end-to-end harness: case definitions, observations and declarative checks.
// Why: Cases (inputs), expectations (JSON) and comparison must agree on one observation shape.
// How: A case drives one HTTP request; the runner turns everything it saw into an Observation; checks read paths in it.

import type { MismatchKind, Source } from "../src/expect/types";
import type { CardRule } from "./expected-cost";
import type { SimPreset, SimRoute } from "./state";
import type { UpstreamScript } from "./upstream";

export type CaseGroup = "failover" | "errors" | "billing" | "byok" | "routing" | "nontext";

export type CaseDef = {
	id: string;
	group: CaseGroup;
	family: string;
	surface?: string;
	mode?: "stream" | "buffered";
	/** Gateway endpoint id, e.g. "chat.completions", "embeddings". */
	endpoint: string;
	/** Client path, e.g. "/v1/chat/completions". */
	path: string;
	/** Executor capability used for the catalogue lookups (e.g. "text.generate", "embeddings"). */
	capability: string;
	routesByModel: Record<string, SimRoute[]>;
	body: Record<string, unknown> | (() => FormData);
	upstream: UpstreamScript;
	bindings?: Record<string, string>;
	teamSettings?: Record<string, unknown>;
	preset?: SimPreset;
	presetModel?: string;
	dynamicRoute?: Record<string, unknown>;
	byokMonthlyCount?: number;
	/** Free text shown in SUMMARY.md. */
	description: string;
};

export type ObservedCall = {
	provider: string | null;
	url: string;
	method: string;
	headers: Record<string, string>;
	/** Which credential reached the provider: "managed", "byok:<key id>", "oauth", "none" or "other". Never the key itself. */
	auth: string;
	body: unknown;
	outcome: string;
};

export type Observation = {
	caseId: string;
	group: CaseGroup;
	family: string;
	surface?: string;
	mode?: "stream" | "buffered";
	model: string;
	routes: string[];
	client: {
		status: number;
		headers: Record<string, string>;
		contentType: string;
		body: unknown;
		/** Every SSE frame in order, data parsed when it is JSON. */
		sse: Array<{ event: string | null; data: unknown }> | null;
		/** `type`/`event`/choice markers of each SSE frame, for order checks. */
		sseTypes: string[] | null;
		bytes: number;
	};
	upstream: {
		calls: ObservedCall[];
		/** Provider ids of provider calls, in order. */
		providers: string[];
		count: number;
	};
	side: { supabase: string[]; blocked: string[]; other: string[] };
	billing: {
		charges: number[];
		chargeCount: number;
		chargeNanos: number;
		successAudits: number;
		failureAudits: number;
		servedProvider: string | null;
		byok: boolean | null;
		auditTotalNanos: number | null;
		meters: Record<string, number>;
		lines: Array<{ meter: string; quantity: number; lineNanos: number }>;
		byokBilling: Record<string, unknown> | null;
		/** Wallet holds for async jobs (gateway_wallet_*_once RPCs). */
		reservations: Array<{ action: string; reservationId: string; amountNanos: number }>;
	};
	audits: Array<{ kind: string; provider: string | null; statusCode: number | null; errorCode: string | null; errorMessage: string | null; stage: string | null }>;
	attempts: Array<Record<string, unknown>>;
	harness: { error: string | null; notes: string[]; durationMs: number };
};

export type CheckOp =
	| "equals"
	| "oneOf"
	| "present"
	| "absent"
	| "matches"
	| "includes"
	| "excludes"
	| "lengthEquals"
	| "lte"
	| "gte"
	| "sseIncludes"
	| "sseExcludes"
	| "sseLast"
	| "billing";

export type BillingSpec = {
	/** Documented meter quantities for the provider usage the harness sent. */
	meters: Record<string, number>;
	/** Meters to fold into another when the card has no rule for them (e.g. cached reads into input). */
	foldUnpriced?: Record<string, string>;
	/** Values the card's match conditions may reference (input_tokens, image_params.*, ...). */
	params?: Record<string, unknown>;
	/** Multiplier applied to the expected total (BYOK fee rate), default 1. */
	factor?: number;
	/** Absolute tolerance in nanos for rounding, default 2 per line. */
	toleranceNanos?: number;
};

export type Check = {
	path: string;
	op: CheckOp;
	value?: unknown;
	/** Mismatch kind on failure. Defaults: present->dropped, absent->invented, else wrong_value. */
	kind?: MismatchKind;
	source: Source;
	note?: string;
};

export type ExpectationEntry = {
	id: string;
	/** Case ids this entry applies to: exact ids, or "re:<regex>". */
	cases: string | string[];
	description?: string;
	checks: Check[];
};

export type ExpectationFile = {
	group: CaseGroup;
	description: string;
	entries: ExpectationEntry[];
};

/** Price rules of the route that served the case (for billing checks). */
export type CardLookup = (provider: string | null) => CardRule[] | null;
