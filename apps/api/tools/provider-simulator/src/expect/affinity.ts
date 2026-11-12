// Purpose: Routing expectation for prompt-cache affinity (sticky routing).
// Why: A request that carries prompt_cache_key must keep later steps on the provider that served the first one.
// How: Calls the gateway's own sticky-routing writer after a simulated success and inspects the simulator's KV.

import * as sticky from "@pipeline/execute/sticky-routing";
import { clearSimulatorKv, simulatorKvEntries } from "../env";
import { WORKSPACE_ID } from "../request-pipeline";
import { resolveSource } from "./text";
import type { Mismatch } from "./types";

export async function affinityMismatches(provider: string, model: string): Promise<Mismatch[]> {
	const out: Mismatch[] = [];
	const ctx = { layer: "executor" as const, provider, family: "text", model, surface: "chat", caseId: "routing:affinity" };
	const source = resolveSource({ kind: "ref", ref: "phaseo-caching-affinity" });
	const write = (sticky as any).maybeWriteStickyRoutingFromUsage as ((args: Record<string, unknown>) => Promise<void>) | undefined;
	if (typeof write !== "function") return out;
	(sticky as any).resetStickyRoutingStateForTests?.();
	const run = async (body: Record<string, unknown>) => {
		clearSimulatorKv();
		await write({
			workspaceId: WORKSPACE_ID, endpoint: "chat.completions", model, body, providerId: provider,
			apiModelId: model, usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 }, enabled: true,
		});
		return simulatorKvEntries().filter(([, value]) => value.includes(`"providerId":"${provider}"`));
	};
	try {
		const keyed = await run({ model, messages: [{ role: "user", content: "SIM" }], prompt_cache_key: "sim-pck-affinity-01" });
		if (!keyed.length) out.push({ ...ctx, kind: "dropped", path: "routing.sticky.pin", expected: "pin after the first successful step", actual: "no pin", source, note: "request carried prompt_cache_key; the response reported no cache tokens" });
		else {
			const stored = keyed.map(([key]) => key).join(" ");
			if (stored.includes("sim-pck-affinity-01")) out.push({ ...ctx, kind: "wrong_value", path: "routing.sticky.key", expected: "key derived from a workspace-scoped hash", actual: "raw prompt_cache_key in the KV key", source });
		}
	} catch (error) {
		out.push({ ...ctx, kind: "error_mapping", path: "routing.sticky.harness", expected: "pin written", actual: error instanceof Error ? error.message : String(error), source: { kind: "assumed", reason: "harness error" } });
	}
	return out;
}
