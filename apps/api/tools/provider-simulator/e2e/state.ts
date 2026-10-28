// Purpose: Shared mutable state between the end-to-end harness, its module mocks and its fetch responder.
// Why: vi.mock factories are hoisted and cannot close over test-local variables; they read this module instead.
// How: One case runs at a time; the runner fills `current` before the request and drains the captures after it.

import type { CapturedRequest } from "../src/fetch-capture";

/** A key the harness hands to a candidate as a decrypted BYOK credential. Always a fake `sim-` value. */
export type SimByokKey = {
	id: string;
	key: string;
	routingMode?: "priority" | "balanced" | "fallback";
	alwaysUse?: boolean;
	sortOrder?: number;
};

/** One provider route offered to the request, built from the catalogue fixtures. */
export type SimRoute = {
	providerId: string;
	apiModelId: string;
	/** Catalogue capability id of the route row (e.g. "text.generate", "text.embed"). Defaults to the case capability. */
	routeCapability?: string;
	byok?: SimByokKey[];
	credentialMode?: "managed_and_byok" | "byok_only";
};

export type SimPreset = {
	id: string;
	name: string;
	slug: string;
	config: Record<string, unknown>;
};

/** Everything the module mocks need to answer for the case in flight. */
export type CaseRuntime = {
	caseId: string;
	workspaceId: string;
	apiKeyId: string;
	/** Model id -> routes. The requested model and any dynamic-route / fallback models must be listed. */
	routesByModel: Record<string, SimRoute[]>;
	capability: string;
	teamSettings: Record<string, unknown>;
	preset: SimPreset | null;
	/** Preset reference that resolves to `preset` (e.g. "@sim-preset"). */
	presetModel: string | null;
	dynamicRoute: Record<string, unknown> | null;
	/** Monthly BYOK request count the counter RPC reports (after this request). */
	byokMonthlyCount: number;
};

export type ChargeCall = { requestId: string; workspaceId: string; costNanos: number; creditSnapshotBalanceNanos: number | null };

export type AuditRecord = {
	kind: "success" | "failure";
	provider: string | null;
	model: string | null;
	byok: boolean | null;
	statusCode: number | null;
	totalNanos: number | null;
	currency: string | null;
	finishReason: string | null;
	usage: Record<string, unknown> | null;
	pricingLines: Array<{ meter: string; quantity: number; lineNanos: number; unitPriceUsd?: string }>;
	byokBilling: Record<string, unknown> | null;
	errorCode: string | null;
	errorMessage: string | null;
	stage: string | null;
	providerAttempts: Array<Record<string, unknown>> | null;
};

export type Captures = {
	calls: Array<CapturedRequest & { classification: "provider" | "side" | "blocked"; provider: string | null; outcome: string }>;
	charges: ChargeCall[];
	reservations: Array<{ action: string; reservationId: string; amountNanos: number }>;
	audits: AuditRecord[];
	priceCardLookups: Array<{ provider: string; model: string; capability: string; found: boolean }>;
	contextLookups: Array<{ model: string; endpoint: string; found: boolean }>;
	harnessNotes: string[];
};

function emptyCaptures(): Captures {
	return { calls: [], charges: [], reservations: [], audits: [], priceCardLookups: [], contextLookups: [], harnessNotes: [] };
}

export const harnessState: { current: CaseRuntime | null; captures: Captures } = {
	current: null,
	captures: emptyCaptures(),
};

export function resetCaptures(): Captures {
	harnessState.captures = emptyCaptures();
	return harnessState.captures;
}

export function currentCase(): CaseRuntime {
	if (!harnessState.current) throw new Error("e2e harness: no case is in flight (a mocked module was called outside a case)");
	return harnessState.current;
}
