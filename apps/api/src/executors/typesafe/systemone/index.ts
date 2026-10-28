// Purpose: TypeSafe Jev executor for the native System One API.
// Why: Jev is a structured evaluator, not an OpenAI-compatible text model.

import type { IRDecisionsRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { completeSystemOne } from "@executors/_shared/decisions/systemone";
import { resolveProviderKey } from "@providers/keys";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { getBindings } from "@/runtime/env";
import { buildTypeSafeRequest } from "./request";

function invalidRequest(args: ExecutorExecuteArgs, message: string, status = 400): ExecutorResult {
	return {
		kind: "completed", terminal: true, localClientError: true,
		upstream: Response.json({ error: status === 413 ? "payload_too_large" : "unsupported_decision_request", message, request_id: args.requestId }, { status }),
		bill: { cost_cents: 0, currency: "USD" },
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRDecisionsRequest;
	const model = args.providerModelSlug?.trim() || "jev-1.13.0";
	const hasBox = Object.values(ir.questions).some(question => question.type === "box");
	if (ir.audio?.length || ir.videos?.length) return invalidRequest(args, "TypeSafe does not support audio or video input.");
	if (hasBox && (!ir.images?.length || model === "jev-1.13.0")) {
		return invalidRequest(args, "Box questions require images and a Box-capable Jev model, such as jev-1.14.0.");
	}
	let body: string;
	try { body = buildTypeSafeRequest(ir, model); } catch (error) {
		return invalidRequest(args, error instanceof Error ? error.message : "Invalid TypeSafe request.", error instanceof RangeError ? 413 : 400);
	}
	const keyInfo = resolveProviderKey({
		providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey,
	}, () => getBindings().TYPESAFE_API_KEY);
	const upstream = await fetchUpstream(args, "https://api.typesafe.ai/v1/systemone", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${keyInfo.key}`,
			"Content-Type": "application/json",
			"Idempotency-Key": args.requestId,
			...(ir.images?.length || hasBox ? { "TypeSafe-Danger-Zone-Images": "true" } : {}),
			...(ir.providerOptions?.typesafe?.long_context === true ? { "TypeSafe-Danger-Zone-Long-Context": "true" } : {}),
			...upstreamTestHeaders(args.meta),
		},
		body,
	});
	return completeSystemOne(args, upstream, keyInfo,
		args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest ? body : undefined);
}

export const executor: ProviderExecutor = execute;
