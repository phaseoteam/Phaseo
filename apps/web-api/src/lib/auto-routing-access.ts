import type { Env } from "@/env";

// Whether a gateway key may use Auto Routing (phaseo/auto). The gateway refuses
// every phaseo/auto request unless the Statsig gate gateway_auto_routing passes
// (isAutoRoutingAccessEnabled in apps/api/src/core/feature-flags.ts). It asks for
// the user who created the calling key, with the workspace and key as custom IDs,
// so this asks Statsig the same question: settings can then refuse Auto where
// the gateway would refuse every answer. Like the gateway, a failed check is a no.

export const AUTO_ROUTING_MODEL = "phaseo/auto";
const AUTO_ROUTING_GATE = "gateway_auto_routing";
const GATE_TIMEOUT_MS = 2_000;

export type AutoRoutingSubject = {
	workspaceId: string;
	/** The key's created_by, or the admin about to create it. */
	userId: string;
	/** The key, once it exists. */
	key?: { id: string; kid: string | null } | null;
};

export function isAutoRoutingModel(model: string | null | undefined): boolean {
	return String(model ?? "").trim().toLowerCase() === AUTO_ROUTING_MODEL;
}

function statsigEnvironmentTier(env: Env): "production" | "staging" | "development" {
	if (env.ENV === "production") return "production";
	if (env.ENV === "preview" || env.ENV === "staging") return "staging";
	return "development";
}

export async function autoRoutingAvailable(env: Env, subject: AutoRoutingSubject): Promise<boolean> {
	const statsigKey = env.STATSIG_SERVER_KEY?.trim();
	// Local development without Statsig keeps Auto, as the gateway's local testing mode does.
	if (!statsigKey) return env.ENV === "development";
	const key = subject.key ?? null;
	try {
		const response = await fetch("https://api.statsig.com/v1/check_gate", {
			method: "POST",
			headers: { "Content-Type": "application/json", "statsig-api-key": statsigKey },
			body: JSON.stringify({
				gateName: AUTO_ROUTING_GATE,
				user: {
					userID: subject.userId,
					customIDs: { workspaceID: subject.workspaceId, apiKeyID: key?.id ?? undefined, apiKeyKid: key?.kid ?? undefined },
					custom: {
						workspace_id: subject.workspaceId,
						api_key_id: key?.id ?? null,
						api_key_ref: key?.kid ? `kid_${key.kid}` : null,
						api_key_kid: key?.kid ?? null,
						is_internal: false,
						surface: "gateway_auto_routing",
					},
					statsigEnvironment: { tier: statsigEnvironmentTier(env) },
				},
			}),
			signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
		});
		if (!response.ok) return false;
		const payload = (await response.json().catch(() => null)) as { value?: unknown; results?: Record<string, { value?: unknown }> } | null;
		if (typeof payload?.value === "boolean") return payload.value;
		return payload?.results?.[AUTO_ROUTING_GATE]?.value === true;
	} catch (error) {
		console.error("[web-api] Auto Routing gate check failed", { workspaceId: subject.workspaceId, error: error instanceof Error ? error.message : String(error) });
		return false;
	}
}
