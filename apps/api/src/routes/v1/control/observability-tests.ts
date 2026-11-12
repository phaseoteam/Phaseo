// Connection checks and sample traces for observability destinations: the API
// side of the dashboard's "Test connection", "Refresh status" and "Send sample
// trace". Each sends the dashboard's sample trace (sampleBroadcastTrace)
// through the gateway's own delivery functions, so the request, its signing
// and its SSRF checks are exactly those of a real delivery. Nothing is queued
// or retried, and the destination's health is not changed.
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { getSupabaseAdmin } from "@/runtime/env";
import { json, withRuntime } from "@/routes/utils";
import { AVAILABLE_BROADCAST_DESTINATION_IDS, broadcastDelivery, sampleBroadcastTrace } from "@/observability/broadcast-destinations";
import { broadcastRows } from "@/observability/broadcast-rows";
import {
	deliverGatewayOtlpPayload,
	deliverGatewayRowsPayload,
	deliverGatewayWebhookPayload,
	destinationConfig,
	type Destination,
} from "@/observability/otlp-export";
import { internalServerError } from "./route-helpers";
import { authorizeObservability, destinationConfigMap, destinationPathId, validateDestinationEndpoint } from "./observability";

const NO_STORE = { "Cache-Control": "no-store" };
const TYPES = new Set<string>(AVAILABLE_BROADCAST_DESTINATION_IDS);
const TEST_COLUMNS = "id,workspace_id,destination_id,name,privacy_exclude_prompts_and_outputs,destination_config,destination_config_ciphertext,destination_config_iv,destination_config_key_version";

type Delivered = { delivered: boolean; status: number | null; error: string | null };

export async function sendSampleTrace(type: string, config: Record<string, unknown>, payload: unknown): Promise<Delivered> {
	const delivery = broadcastDelivery(type);
	if (delivery === "otlp") return deliverGatewayOtlpPayload(payload, config, 1, type);
	if (delivery === "rows") return deliverGatewayRowsPayload(broadcastRows(payload, `sample:${crypto.randomUUID()}`), config, 1, type);
	if (delivery === "webhook") return deliverGatewayWebhookPayload(payload, config);
	return { delivered: false, status: null, error: "This destination type cannot receive traces yet" };
}

function result(sent: Delivered, success: string) {
	return json({
		data: {
			ok: sent.delivered,
			status: sent.delivered ? success : "Failed",
			http_status: sent.status,
			error: sent.delivered ? null : sent.error,
		},
	}, 200, NO_STORE);
}

/** Checks a destination's settings before saving them: sends a sample trace without its messages. */
export async function testDestinationConfig(req: Request) {
	const access = await authorizeObservability(req, CAPABILITIES.SETTINGS_WRITE);
	if ("response" in access) return access.response;
	const body = await req.json<Record<string, unknown>>().catch(() => null);
	if (!body) return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, NO_STORE);
	const type = String(body.type ?? "").trim();
	if (!TYPES.has(type)) return json({ error: "bad_request", message: `type must be one of: ${AVAILABLE_BROADCAST_DESTINATION_IDS.join(", ")}` }, 400, NO_STORE);
	const config = destinationConfigMap(body.config);
	if (!config) return json({ error: "bad_request", message: "config must be a non-empty string map" }, 400, NO_STORE);
	try { validateDestinationEndpoint(type, config); } catch (error) { return json({ error: "bad_request", message: String((error as Error).message) }, 400, NO_STORE); }
	try {
		return result(await sendSampleTrace(type, config, sampleBroadcastTrace("Connection test", true)), "Connection verified");
	} catch (error) {
		return internalServerError("observability.destinations.test_config", error);
	}
}

async function loadForTest(workspaceId: string, id: string): Promise<(Destination & { name: string | null }) | null> {
	const { data, error } = await getSupabaseAdmin().from("workspace_broadcast_destinations").select(TEST_COLUMNS)
		.eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
	if (error) throw new Error(error.message || "Failed to load observability destination");
	const row = data as (Destination & { name: string | null }) | null;
	return row && TYPES.has(String(row.destination_id)) ? row : null;
}

/**
 * A saved destination, with its stored settings. mode "test" is the
 * connection check (no messages); "sample" sends the sample trace, with
 * messages unless the destination leaves prompts and outputs out.
 */
async function sendToSaved(req: Request, mode: "test" | "sample") {
	const access = await authorizeObservability(req, CAPABILITIES.SETTINGS_WRITE);
	if ("response" in access) return access.response;
	const id = destinationPathId(new URL(req.url));
	if (!id) return json({ error: "bad_request", message: "Destination id is required" }, 400, NO_STORE);
	try {
		const row = await loadForTest(access.auth.workspaceId, id);
		if (!row) return json({ error: "not_found", message: "Observability destination not found" }, 404, NO_STORE);
		const name = String(row.name ?? "Broadcast");
		const privateMode = mode === "test" || Boolean(row.privacy_exclude_prompts_and_outputs);
		const sent = await sendSampleTrace(String(row.destination_id), await destinationConfig(row), sampleBroadcastTrace(name, privateMode));
		return result(sent, mode === "test" ? "Connected" : "Sample trace sent");
	} catch (error) {
		return internalServerError(`observability.destinations.${mode}`, error);
	}
}

export const testSavedDestination = (req: Request) => sendToSaved(req, "test");
export const sendSavedDestinationSample = (req: Request) => sendToSaved(req, "sample");

export const observabilityTestRoutes = new Hono<Env>();

observabilityTestRoutes.post("/destinations/test", withRuntime(testDestinationConfig));
observabilityTestRoutes.post("/destinations/:id/test", withRuntime(testSavedDestination));
observabilityTestRoutes.post("/destinations/:id/sample", withRuntime(sendSavedDestinationSample));
