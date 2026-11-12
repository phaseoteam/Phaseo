// Purpose: Generate expectations/providers/<id>.json from the cached specs and API-reference facts.
// Why: Upstream URL, auth and documented operations must come from the provider's own documentation, not from
//      the gateway code under test, and must be reviewable as data.
// How: Reads specs/*.json (servers, securitySchemes, operations), specs/research.json (API reference base URLs) and
//      the hand-kept facts below for native and cloud providers. Existing `overrides` blocks are preserved.
//      Provider ids come from the catalogue database (v2_model_provider_routes), so it needs the credentials
//      src/catalogue.ts reads (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
//
// Usage: pnpm --filter @phaseo/gateway-api exec tsx tools/provider-simulator/scripts/build-expectations.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalogue } from "../src/catalogue";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const specsDir = path.join(root, "specs");
const outDir = path.join(root, "expectations", "providers");

type Source = Record<string, unknown>;
type Operation = { urlPattern: string; source: Source };
type ProviderFacts = {
	provider: string;
	operations: Partial<Record<"openai-chat" | "openai-responses" | "anthropic-messages" | "gemini" | "gemini-interactions", Operation>>;
	auth: { headers: Record<string, string>; source: Source } | null;
};

const manifest = JSON.parse(fs.readFileSync(path.join(specsDir, "manifest.json"), "utf8")).providers as Record<string, { spec: string; kind: string }>;
const research = JSON.parse(fs.readFileSync(path.join(specsDir, "research.json"), "utf8")).providers as Record<string, any>;

function escape(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Turns a URL template ({project}, {modelsId}, …) into an anchored regex source. */
function pattern(url: string): string {
	const parts = url.split(/\{[^}]+\}/);
	return `^${parts.map(escape).join("[^/]+")}(\\?.*)?$`;
}

function joinUrl(base: string, opPath: string): string {
	const cleanBase = base.replace(/\/+$/, "");
	let cleanPath = opPath.startsWith("/") ? opPath : `/${opPath}`;
	// Specs disagree on whether /v1 lives in the server or the path; never double it.
	const baseTail = cleanBase.match(/\/v\d+(beta)?$/)?.[0];
	if (baseTail && cleanPath.startsWith(`${baseTail}/`)) cleanPath = cleanPath.slice(baseTail.length);
	return `${cleanBase}${cleanPath}`;
}

function firstUrl(text: string | null | undefined): string | null {
	const match = String(text ?? "").match(/https:\/\/[^\s(),;]+/);
	return match ? match[0].replace(/\/+$/, "") : null;
}

const DIALECT_FOR_OPERATION: Record<string, keyof ProviderFacts["operations"]> = {
	chat: "openai-chat",
	responses: "openai-responses",
	messages: "anthropic-messages",
	generateContent: "gemini",
	interactions: "gemini-interactions",
};

function authFromSpec(spec: any): ProviderFacts["auth"] {
	const schemes = Object.values(spec.securitySchemes ?? {}) as any[];
	const sourceRef = { kind: "spec", spec: `specs/${spec.id}.json`, path: "#/securitySchemes" };
	for (const scheme of schemes) {
		if (scheme?.type === "http" && String(scheme.scheme).toLowerCase() === "bearer") return { headers: { authorization: "^Bearer sim-" }, source: sourceRef };
	}
	for (const scheme of schemes) {
		if (scheme?.type === "apiKey" && scheme.in === "header") {
			const name = String(scheme.name).toLowerCase();
			return { headers: { [name]: name === "authorization" ? "^Bearer sim-" : "^sim-" }, source: sourceRef };
		}
	}
	return null;
}

/** Native and cloud routes whose URL shape is documented outside an OpenAPI server list. */
const HAND_KEPT: Record<string, Partial<ProviderFacts>> = {
	anthropic: {
		operations: { "anthropic-messages": { urlPattern: pattern("https://api.anthropic.com/v1/messages"), source: { kind: "ref", ref: "anthropic-messages" } } },
		auth: { headers: { "x-api-key": "^sim-", "anthropic-version": "^\\d{4}-\\d{2}-\\d{2}$" }, source: { kind: "ref", ref: "anthropic-versioning" } },
	},
	"google-vertex": {
		operations: {
			gemini: { urlPattern: "^https://([a-z0-9-]+-)?aiplatform(\\.[a-z]+\\.rep)?\\.googleapis\\.com/v1(beta1)?/projects/[^/]+/locations/[^/]+/publishers/google/models/[^/:]+:(stream)?[gG]enerateContent(\\?alt=sse)?$", source: { kind: "docs", url: "https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/projects.locations.publishers.models/streamGenerateContent" } },
			"anthropic-messages": { urlPattern: "^https://([a-z0-9-]+-)?aiplatform(\\.[a-z]+\\.rep)?\\.googleapis\\.com/v1/projects/[^/]+/locations/[^/]+/publishers/anthropic/models/[^/:]+:(stream)?[rR]awPredict$", source: { kind: "ref", ref: "vertex-claude" } },
			"openai-chat": { urlPattern: "^https://([a-z0-9-]+-)?aiplatform(\\.[a-z]+\\.rep)?\\.googleapis\\.com/v1(beta1)?/projects/[^/]+/locations/[^/]+/endpoints/openapi/chat/completions$", source: { kind: "docs", url: "https://cloud.google.com/vertex-ai/generative-ai/docs/maas/use-open-models" } },
		},
		auth: { headers: { authorization: "^Bearer " }, source: { kind: "docs", url: "https://cloud.google.com/vertex-ai/docs/authentication" } },
	},
	"google-ai-studio": {
		operations: {
			gemini: { urlPattern: "^https://generativelanguage\\.googleapis\\.com/v1beta/models/[^/:]+:(stream)?[gG]enerateContent(\\?alt=sse)?$", source: { kind: "spec", spec: "specs/google-ai-studio.json", path: "generativelanguage.models.generateContent" } },
			"gemini-interactions": { urlPattern: "^https://generativelanguage\\.googleapis\\.com/v1beta/interactions$", source: { kind: "docs", url: "https://ai.google.dev/api/interactions-api" } },
		},
		auth: { headers: { "x-goog-api-key": "^sim-" }, source: { kind: "docs", url: "https://ai.google.dev/gemini-api/docs/api-key" } },
	},
	"amazon-bedrock": {
		operations: {
			"openai-chat": { urlPattern: "^https://bedrock-(mantle|runtime)\\.[a-z0-9-]+\\.(api\\.aws|amazonaws\\.com)(/openai)?/v1/chat/completions$", source: { kind: "docs", url: "https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html" } },
			"openai-responses": { urlPattern: "^https://bedrock-(mantle|runtime)\\.[a-z0-9-]+\\.(api\\.aws|amazonaws\\.com)(/openai)?/v1/responses$", source: { kind: "docs", url: "https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-mantle.html" } },
			"anthropic-messages": { urlPattern: "^https://bedrock-mantle\\.[a-z0-9-]+\\.api\\.aws/anthropic/v1/messages$", source: { kind: "ref", ref: "bedrock-claude-messages" } },
		},
		auth: { headers: { authorization: "^Bearer sim-" }, source: { kind: "docs", url: "https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html" } },
	},
	azure: {
		operations: {
			"openai-chat": { urlPattern: "^https://[^/]+\\.openai\\.azure\\.com/openai(/v1)?(/deployments/[^/]+)?/chat/completions(\\?.*)?$", source: { kind: "spec", spec: "specs/azure.json", path: "/chat/completions" } },
			"openai-responses": { urlPattern: "^https://[^/]+\\.openai\\.azure\\.com/openai(/v1)?/responses(\\?.*)?$", source: { kind: "spec", spec: "specs/azure.json", path: "/responses" } },
		},
		auth: { headers: { "api-key": "^sim-" }, source: { kind: "spec", spec: "specs/azure.json", path: "#/securitySchemes/ApiKeyAuth" } },
	},
	cloudflare: {
		operations: {
			"openai-chat": { urlPattern: "^https://api\\.cloudflare\\.com/client/v4/accounts/[^/]+/ai/v1/chat/completions$", source: { kind: "docs", url: "https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/" } },
			"openai-responses": { urlPattern: "^https://api\\.cloudflare\\.com/client/v4/accounts/[^/]+/ai/v1/responses$", source: { kind: "docs", url: "https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/" } },
		},
	},
};
for (const alias of ["anthropic-us"]) HAND_KEPT[alias] = HAND_KEPT.anthropic;
HAND_KEPT["google-vertex-eu"] = HAND_KEPT["google-vertex"];
HAND_KEPT["anthropic-aws"] = {
	operations: { "anthropic-messages": { urlPattern: "^https://aws-external-anthropic\\.[a-z0-9-]+\\.api\\.aws/v1/messages$", source: { kind: "assumed", reason: "Claude Platform on AWS hostnames are not in a public spec; the Messages path follows the Anthropic API." } } },
	auth: { headers: { "x-api-key": "^sim-", "anthropic-version": "^\\d{4}-\\d{2}-\\d{2}$" }, source: { kind: "ref", ref: "anthropic-versioning" } },
};
HAND_KEPT["anthropic-aws-us"] = HAND_KEPT["anthropic-aws"];

function buildFacts(provider: string): ProviderFacts {
	const facts: ProviderFacts = { provider, operations: {}, auth: null };
	const entry = manifest[provider];
	if (entry?.kind === "own") {
		const specFile = path.join(specsDir, `${entry.spec}.json`);
		if (fs.existsSync(specFile)) {
			const spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
			const server = String(spec.servers?.[0]?.url ?? "");
			for (const [operation, opPath] of Object.entries(spec.operationPaths ?? {})) {
				const dialect = DIALECT_FOR_OPERATION[operation];
				if (!dialect || !opPath || !/^https:\/\//.test(server) || /\{/.test(server.split("//")[1]?.split("/")[0] ?? "")) continue;
				facts.operations[dialect] = {
					urlPattern: pattern(joinUrl(server, String(opPath))),
					source: { kind: "spec", spec: `specs/${entry.spec}.json`, path: `servers[0] + ${opPath}` },
				};
			}
			facts.auth = authFromSpec(spec);
		}
	}
	const facts2 = research[provider];
	if (!Object.keys(facts.operations).length && facts2) {
		const base = firstUrl(facts2.baseUrl);
		if (base) {
			const fromOurConfig = /gateway config/i.test(String(facts2.baseUrl));
			facts.operations["openai-chat"] = {
				urlPattern: pattern(`${base}/chat/completions`),
				source: fromOurConfig
					? { kind: "assumed", reason: `API reference does not state a base URL; ${base} comes from Phaseo's provider config` }
					: { kind: "docs", url: facts2.chatReferenceUrl ?? base, note: `base URL ${base}` },
			};
		}
	}
	const kept = HAND_KEPT[provider];
	if (kept?.operations) facts.operations = { ...facts.operations, ...kept.operations };
	if (kept?.auth) facts.auth = kept.auth;
	if (!facts.auth && Object.keys(facts.operations).some((dialect) => dialect.startsWith("openai"))) {
		facts.auth = { headers: { authorization: "^Bearer sim-" }, source: { kind: "assumed", reason: "OpenAI-compatible API; bearer authentication as in https://platform.openai.com/docs/api-reference/authentication" } };
	}
	return facts;
}

async function main() {
	fs.mkdirSync(outDir, { recursive: true });
	const providers = [...new Set((await loadCatalogue()).routes.map((route) => route.providerId))];
	const ids = Array.from(new Set([...providers, ...Object.keys(manifest), ...Object.keys(HAND_KEPT)])).sort();
	let written = 0;
	for (const id of ids) {
		const facts = buildFacts(id);
		if (!Object.keys(facts.operations).length && !facts.auth) continue;
		const file = path.join(outDir, `${id}.json`);
		const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
		const out = {
			provider: id,
			note: "generated by scripts/build-expectations.ts; edit `overrides` only",
			generated: { operations: facts.operations, auth: facts.auth },
			overrides: previous?.overrides ?? {},
		};
		fs.writeFileSync(file, `${JSON.stringify(out, null, "\t")}\n`);
		written += 1;
	}
	console.log(`[build-expectations] wrote ${written} provider files`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
