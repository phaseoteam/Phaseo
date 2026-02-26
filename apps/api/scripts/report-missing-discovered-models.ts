import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

type SourceMode = "json" | "db";
type DiscoveredRow = { provider_id: string; model_id: string };
type ConfiguredDbRow = {
	provider_id: string | null;
	provider_model_slug: string | null;
	api_model_id: string | null;
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(API_ROOT, "..", "..");
const API_PROVIDERS_DIR = path.join(REPO_ROOT, "apps", "web", "src", "data", "api_providers");
const DISCOVERY_STATE_PATH = path.join(REPO_ROOT, "scripts", "model-discovery", "state", "provider-model-snapshots.json");
const WRANGLER_TOML_PATH = path.join(API_ROOT, "wrangler.toml");
const PAGE_SIZE = 1000;

const PROVIDER_ALIASES: Record<string, string> = {
	"alibaba-cloud": "alibaba",
	"xai": "x-ai",
};

function canonicalProviderId(value: string): string {
	const key = value.trim().toLowerCase();
	return PROVIDER_ALIASES[key] ?? key;
}

function canonicalModelId(value: string): string {
	return value.trim().toLowerCase();
}

function parseArgs(argv: string[]): {
	configured: SourceMode;
	discovered: SourceMode;
	jsonOutput: boolean;
} {
	let configured: SourceMode = "json";
	let discovered: SourceMode = "db";
	let jsonOutput = false;

	for (const raw of argv) {
		if (raw === "--json") {
			jsonOutput = true;
			continue;
		}
		if (raw.startsWith("--configured=")) {
			const value = raw.slice("--configured=".length) as SourceMode;
			if (value === "json" || value === "db") configured = value;
			continue;
		}
		if (raw.startsWith("--discovered=")) {
			const value = raw.slice("--discovered=".length) as SourceMode;
			if (value === "json" || value === "db") discovered = value;
		}
	}

	return { configured, discovered, jsonOutput };
}

function parseEnvFileContents(raw: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq <= 0) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith("\"") && value.endsWith("\"")) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		out[key] = value;
	}
	return out;
}

function loadLocalEnvFiles(): void {
	const candidates = [
		path.join(API_ROOT, ".dev.vars"),
		path.join(API_ROOT, ".env.local"),
		path.join(API_ROOT, ".env"),
		path.join(REPO_ROOT, ".env.local"),
		path.join(REPO_ROOT, ".env"),
	];

	for (const filePath of candidates) {
		if (!fs.existsSync(filePath)) continue;
		try {
			const parsed = parseEnvFileContents(fs.readFileSync(filePath, "utf-8"));
			for (const [key, value] of Object.entries(parsed)) {
				if (process.env[key] === undefined) process.env[key] = value;
			}
		} catch {
			// Best-effort local env loading only.
		}
	}
}

function resolveSupabaseUrl(): string {
	const direct = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
	if (direct && direct.trim()) return direct.trim();

	if (fs.existsSync(WRANGLER_TOML_PATH)) {
		const raw = fs.readFileSync(WRANGLER_TOML_PATH, "utf-8");
		const match = raw.match(/^\s*SUPABASE_URL\s*=\s*"([^"]+)"/m);
		if (match?.[1]) return match[1].trim();
	}

	throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
}

function createSupabaseAdmin() {
	const supabaseUrl = resolveSupabaseUrl();
	const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
	return createClient(supabaseUrl, serviceRole, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

function ensureProviderSet(map: Map<string, Set<string>>, providerId: string): Set<string> {
	const key = canonicalProviderId(providerId);
	const existing = map.get(key);
	if (existing) return existing;
	const created = new Set<string>();
	map.set(key, created);
	return created;
}

async function loadConfiguredFromJson(): Promise<Map<string, Set<string>>> {
	const out = new Map<string, Set<string>>();
	const providerDirs = fs.readdirSync(API_PROVIDERS_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory());

	for (const providerDir of providerDirs) {
		const providerId = providerDir.name;
		const modelsPath = path.join(API_PROVIDERS_DIR, providerId, "models.json");
		if (!fs.existsSync(modelsPath)) continue;

		let parsed: unknown;
		try {
			parsed = JSON.parse(fs.readFileSync(modelsPath, "utf-8"));
		} catch {
			continue;
		}
		if (!Array.isArray(parsed)) continue;

		const set = ensureProviderSet(out, providerId);
		for (const row of parsed) {
			if (!row || typeof row !== "object") continue;
			const rec = row as Record<string, unknown>;
			const slug = rec.provider_model_slug;
			if (typeof slug === "string" && slug.trim()) {
				set.add(canonicalModelId(slug));
			}
			const apiModelId = rec.api_model_id;
			if (typeof apiModelId === "string" && apiModelId.includes("/")) {
				const tail = apiModelId.split("/").slice(1).join("/").trim();
				if (tail) set.add(canonicalModelId(tail));
			}
		}
	}
	return out;
}

async function loadConfiguredFromDb(): Promise<Map<string, Set<string>>> {
	const supabase = createSupabaseAdmin();
	const out = new Map<string, Set<string>>();
	let from = 0;

	while (true) {
		const { data, error } = await supabase
			.from("data_api_provider_models")
			.select("provider_id, provider_model_slug, api_model_id")
			.range(from, from + PAGE_SIZE - 1);
		if (error) throw new Error(error.message || "Failed loading data_api_provider_models");

		const rows = (data ?? []) as ConfiguredDbRow[];
		if (rows.length === 0) break;
		for (const row of rows) {
			if (!row.provider_id) continue;
			const set = ensureProviderSet(out, row.provider_id);
			if (typeof row.provider_model_slug === "string" && row.provider_model_slug.trim()) {
				set.add(canonicalModelId(row.provider_model_slug));
			}
			if (typeof row.api_model_id === "string" && row.api_model_id.includes("/")) {
				const tail = row.api_model_id.split("/").slice(1).join("/").trim();
				if (tail) set.add(canonicalModelId(tail));
			}
		}

		if (rows.length < PAGE_SIZE) break;
		from += PAGE_SIZE;
	}

	return out;
}

async function loadDiscoveredFromDb(): Promise<DiscoveredRow[]> {
	const supabase = createSupabaseAdmin();
	const out: DiscoveredRow[] = [];
	let from = 0;

	while (true) {
		const { data, error } = await supabase
			.from("model_discovery_seen_models")
			.select("provider_id, model_id")
			.range(from, from + PAGE_SIZE - 1);
		if (error) throw new Error(error.message || "Failed loading model_discovery_seen_models");

		const rows = (data ?? []) as Array<{ provider_id: unknown; model_id: unknown }>;
		if (rows.length === 0) break;

		for (const row of rows) {
			if (typeof row.provider_id !== "string" || typeof row.model_id !== "string") continue;
			out.push({ provider_id: row.provider_id, model_id: row.model_id });
		}

		if (rows.length < PAGE_SIZE) break;
		from += PAGE_SIZE;
	}

	return out;
}

async function loadDiscoveredFromJson(): Promise<DiscoveredRow[]> {
	if (!fs.existsSync(DISCOVERY_STATE_PATH)) {
		throw new Error(`Discovery state JSON not found at ${DISCOVERY_STATE_PATH}`);
	}

	const raw = JSON.parse(fs.readFileSync(DISCOVERY_STATE_PATH, "utf-8")) as {
		providers?: Record<string, { models?: Record<string, unknown> }>;
	};
	const providers = raw.providers ?? {};
	const out: DiscoveredRow[] = [];

	for (const [providerId, snapshot] of Object.entries(providers)) {
		const models = snapshot?.models ?? {};
		for (const modelId of Object.keys(models)) {
			out.push({ provider_id: providerId, model_id: modelId });
		}
	}
	return out;
}

function computeMissing(args: {
	discoveredRows: DiscoveredRow[];
	configuredByProvider: Map<string, Set<string>>;
}) {
	const missing = new Map<string, string[]>();

	for (const row of args.discoveredRows) {
		const providerId = canonicalProviderId(row.provider_id);
		const modelId = canonicalModelId(row.model_id);
		const configured = args.configuredByProvider.get(providerId);
		if (configured?.has(modelId)) continue;

		const list = missing.get(providerId);
		if (list) {
			list.push(row.model_id);
		} else {
			missing.set(providerId, [row.model_id]);
		}
	}

	for (const [, list] of missing) {
		list.sort((a, b) => a.localeCompare(b));
	}

	return missing;
}

async function main() {
	loadLocalEnvFiles();
	const cli = parseArgs(process.argv.slice(2));

	const configuredByProvider =
		cli.configured === "db"
			? await loadConfiguredFromDb()
			: await loadConfiguredFromJson();
	const discoveredRows =
		cli.discovered === "db"
			? await loadDiscoveredFromDb()
			: await loadDiscoveredFromJson();

	const missing = computeMissing({ discoveredRows, configuredByProvider });
	const providers = Array.from(missing.keys()).sort((a, b) => a.localeCompare(b));
	const totalModels = providers.reduce((sum, providerId) => sum + (missing.get(providerId)?.length ?? 0), 0);

	if (cli.jsonOutput) {
		const payload = {
			configuredSource: cli.configured,
			discoveredSource: cli.discovered,
			providersWithMissing: providers.length,
			totalMissingModels: totalModels,
			missing: providers.map((providerId) => ({
				providerId,
				models: missing.get(providerId) ?? [],
			})),
		};
		console.log(JSON.stringify(payload, null, 2));
		return;
	}

	console.log(
		`Missing configured provider models: ${totalModels} across ${providers.length} provider(s) [configured=${cli.configured}, discovered=${cli.discovered}]`,
	);
	if (providers.length === 0) return;

	for (const providerId of providers) {
		const models = missing.get(providerId) ?? [];
		console.log(`\n${providerId} (${models.length})`);
		for (const modelId of models) {
			console.log(`  - ${modelId}`);
		}
	}
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[report-missing-discovered-models] ${message}`);
	process.exitCode = 1;
});
