// Purpose: Offline runtime bindings for the provider simulator.
// Why: Executors read provider keys from the runtime; the simulator must never hold real ones.
// How: Every key-like binding gets a fake value; base URLs stay unset so executors use their real defaults.

import { BINDING_KEYS } from "@/runtime/env.binding-keys";
import { clearRuntime, configureRuntime, getBindingsIfConfigured, type GatewayBindings } from "@/runtime/env";

const SECRET_LIKE = /(API_KEY|_KEY|_TOKEN|_PAT|_SECRET|ACCESS_KEY_ID|SECRET_ACCESS_KEY)$/;
const NEVER_FAKE = /(PEPPER|ENCRYPTION|WEBHOOK|SUPABASE|CONTROL|SCIM|HMAC|INVITE|AXIOM|LINEAR|INTERNAL_TEST|PERF)/;

// Bindings that are identifiers rather than secrets but that executors need to build a URL.
const FIXED_BINDINGS: Record<string, string> = {
	SUPABASE_URL: "https://supabase.sim.invalid",
	SUPABASE_SERVICE_ROLE_KEY: "sim-supabase-service-role",
	GOOGLE_VERTEX_PROJECT: "sim-project",
	GOOGLE_VERTEX_PROJECT_NUMBER: "000000000000",
	GOOGLE_VERTEX_LOCATION: "global",
	CLOUDFLARE_ACCOUNT_ID: "sim-account",
	CLOUDFLARE_AI_GATEWAY_ID: "sim-gateway",
	AWS_REGION: "us-east-1",
	AMAZON_BEDROCK_REGION: "us-east-1",
	ANTHROPIC_AWS_WORKSPACE_ID: "wrkspc_sim0001",
	AZURE_OPENAI_BASE_URL: "https://sim-resource.openai.azure.com/openai",
	LINEAR_TEAM_ID: "",
	NODE_ENV: "test",
};

function createMemoryKv(): KVNamespace {
	const store = new Map<string, string>();
	return {
		async get(key: string, type?: string) {
			const value = store.get(key);
			if (value === undefined) return null;
			return type === "json" ? JSON.parse(value) : value;
		},
		async put(key: string, value: string) {
			store.set(key, typeof value === "string" ? value : String(value));
		},
		async delete(key: string) {
			store.delete(key);
		},
		async list() {
			return { keys: [], list_complete: true, cacheStatus: null };
		},
	} as unknown as KVNamespace;
}

export function simulatorBindings(): GatewayBindings {
	const bindings: Record<string, unknown> = {};
	for (const key of BINDING_KEYS as string[]) {
		if (SECRET_LIKE.test(key) && !NEVER_FAKE.test(key)) {
			bindings[key] = `sim-${key.toLowerCase().replace(/_/g, "-")}`;
		}
	}
	Object.assign(bindings, FIXED_BINDINGS);
	bindings.GATEWAY_CACHE = createMemoryKv();
	return bindings as unknown as GatewayBindings;
}

let configured = false;

export function setupSimulatorRuntime(): void {
	if (configured) return;
	configureRuntime(simulatorBindings());
	configured = true;
}

export function teardownSimulatorRuntime(): void {
	if (!configured) return;
	clearRuntime();
	configured = false;
}

/** Bindings a provider needs that differ from the shared defaults (e.g. a regional location). */
export const PROVIDER_BINDINGS: Record<string, Record<string, string>> = {
	"google-vertex-eu": { GOOGLE_VERTEX_LOCATION: "europe-west4" },
};

function reconfigure(bindings: GatewayBindings) {
	// Bindings are frozen once configured, so swap the whole runtime.
	while (getBindingsIfConfigured()) clearRuntime();
	configureRuntime(bindings);
}

/** Runs a block with per-provider binding overrides, then restores the shared bindings. */
export async function withProviderBindings<T>(providerId: string, run: () => Promise<T>): Promise<T> {
	const overrides = PROVIDER_BINDINGS[providerId];
	if (!overrides) return run();
	reconfigure({ ...(simulatorBindings() as unknown as Record<string, unknown>), ...overrides } as unknown as GatewayBindings);
	try {
		return await run();
	} finally {
		reconfigure(simulatorBindings());
	}
}
