import type { Env } from "@/env";

// Whether a workspace may use request classifiers. The gateway only classifies
// requests, and its /v1/classifiers API only answers, when the Statsig gate
// gateway_request_classifiers passes for the workspace owner
// (isRequestClassifiersAccessEnabled in apps/api/src/core/feature-flags.ts). This
// asks Statsig the same question, so settings can't save classifiers the gateway
// would then ignore. Like the gateway, a failed check is a no.

const REQUEST_CLASSIFIERS_GATE = "gateway_request_classifiers";
const GATE_TIMEOUT_MS = 2_000;

function statsigEnvironmentTier(env: Env): "production" | "staging" | "development" {
	if (env.ENV === "production") return "production";
	if (env.ENV === "preview" || env.ENV === "staging") return "staging";
	return "development";
}

export async function requestClassifiersAvailable(env: Env, subject: { workspaceId: string; ownerUserId: string | null }): Promise<boolean> {
	const statsigKey = env.STATSIG_SERVER_KEY?.trim();
	// Local development without Statsig keeps classifiers, as the gateway's local testing mode does.
	if (!statsigKey) return env.ENV === "development";
	if (!subject.ownerUserId) return false;
	try {
		const response = await fetch("https://api.statsig.com/v1/check_gate", {
			method: "POST",
			headers: { "Content-Type": "application/json", "statsig-api-key": statsigKey },
			body: JSON.stringify({
				gateName: REQUEST_CLASSIFIERS_GATE,
				user: {
					userID: subject.ownerUserId,
					customIDs: { workspaceID: subject.workspaceId },
					custom: {
						workspace_id: subject.workspaceId,
						api_key_id: null,
						api_key_ref: null,
						api_key_kid: null,
						is_internal: false,
						surface: "gateway_request_classifiers",
					},
					statsigEnvironment: { tier: statsigEnvironmentTier(env) },
				},
			}),
			signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
		});
		if (!response.ok) return false;
		const payload = (await response.json().catch(() => null)) as { value?: unknown; results?: Record<string, { value?: unknown }> } | null;
		if (typeof payload?.value === "boolean") return payload.value;
		return payload?.results?.[REQUEST_CLASSIFIERS_GATE]?.value === true;
	} catch (error) {
		console.error("[web-api] Request classifiers gate check failed", { workspaceId: subject.workspaceId, error: error instanceof Error ? error.message : String(error) });
		return false;
	}
}
