// src/lib/gateway/audit/database.ts
// Purpose: Persist audits and send analytics events.
// Why: Ensures observability for every request.
// How: Database helpers for audit persistence.

import { getSupabaseAdmin } from "@/runtime/env";
import type { Endpoint } from "@core/types";
import { ensureAppId } from "../after/apps";
import { shapeUsageForClient } from "../usage";

export type PersistArgs = {
	requestId: string;
	workspaceId: string;

	// identity
	provider: string;
	model: string;
	endpoint: Endpoint;
	nativeResponseId?: string | null;

	// app hints
	appTitle?: string | null;
	referer?: string | null;

	// request context
	stream: boolean;
	isByok: boolean;

	// timings
	generationMs: number | null;
	latencyMs: number | null;

	// usage & money
	usagePriced: any;
	totalCents: number;
	currency: "USD";

	// completion
	finishReason?: string | null;
};

function svc() {
	return getSupabaseAdmin();
}

/** Insert or upsert a generation row (idempotent on workspace_id+request_id). */
async function upsertGeneration(args: PersistArgs & { appId?: string | null }) {
	const supabase = svc();

	const row = {
		request_id: args.requestId,
		workspace_id: args.workspaceId,

		provider: args.provider,
		model_id: args.model,
		endpoint: args.endpoint,
		app_id: args.appId ?? null,
		api_type: args.endpoint,
		stream: !!args.stream,
		is_byok: !!args.isByok,

		generation_ms: typeof args.generationMs === "number"
			? Math.max(0, Math.round(args.generationMs))
			: null,
		latency_ms: typeof args.latencyMs === "number"
			? Math.max(0, Math.round(args.latencyMs))
			: null,

		usage: normalizeUsageTokens(args.usagePriced ?? {}),
		usage_cents_text: String(args.totalCents ?? 0),
		currency: args.currency,

		finish_reason: args.finishReason ?? null,

		// Optional convenience fields (add column if you want):
		// native_response_id: args.nativeResponseId ?? null,
	};

	const { error } = await supabase
		.from("gateway_generations")
		.upsert(row, { onConflict: "workspace_id,request_id" });

	if (error) {
		console.error("gateway_generations upsert error:", error, { row });
	}
}

/** Public: persist generation (app upsert + generation upsert) */
export async function persistGenerationToSupabase(args: PersistArgs) {
	try {
		const appId = await ensureAppId({
			workspaceId: args.workspaceId,
			appTitle: args.appTitle ?? null,
			referer: args.referer ?? null,
		});

		await upsertGeneration({ ...args, appId });
	} catch (err) {
		console.error("persistGenerationToSupabase fatal:", err);
	}
}

function normalizeUsageTokens(usage: any) {
	if (!usage || typeof usage !== "object") return usage;
	try {
		return shapeUsageForClient(usage);
	} catch {
		return usage;
	}
}
