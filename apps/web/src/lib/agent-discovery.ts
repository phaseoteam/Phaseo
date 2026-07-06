import { createHash } from "node:crypto";
import { absoluteUrl, SITE_URL } from "@/lib/seo";

const DEFAULT_DOCS_BASE_URL = "https://phaseo.ai";
const DEFAULT_GATEWAY_API_BASE_URL = "https://api.phaseo.ai/v1";
const DEFAULT_SUPABASE_BASE_URL = "https://xansbgjaduxypzsmjwct.supabase.co";

function normalizeUrl(value: string): string {
	return value.replace(/\/+$/, "");
}

function normalizeSupabaseBaseUrl(value: string): string {
	const trimmed = normalizeUrl(value);
	if (trimmed.endsWith("/auth/v1")) {
		return trimmed.slice(0, -"/auth/v1".length);
	}
	return trimmed;
}

export const DOCS_BASE_URL = normalizeUrl(
	process.env.NEXT_PUBLIC_DOCS_URL ?? DEFAULT_DOCS_BASE_URL,
);
export const API_BASE_URL = normalizeUrl(
	process.env.NEXT_PUBLIC_GATEWAY_API_URL ?? DEFAULT_GATEWAY_API_BASE_URL,
);
export const API_ORIGIN = new URL(API_BASE_URL).origin;
export const API_HEALTH_URL = `${API_BASE_URL}/health`;
export const API_DOCS_URL = `${DOCS_BASE_URL}/v1/api-reference/introduction`;
export const API_OPENAPI_URL = `${DOCS_BASE_URL}/openapi/v1/openapi.yaml`;
export const API_QUICKSTART_URL = `${DOCS_BASE_URL}/v1/quickstart`;
export const MODELS_URL = absoluteUrl("/models");
export const PRICING_URL = absoluteUrl("/pricing");
export const API_CATALOG_URL = absoluteUrl("/.well-known/api-catalog");
export const AGENT_SKILLS_INDEX_URL = absoluteUrl(
	"/.well-known/agent-skills/index.json",
);
export const MCP_SERVER_CARD_URL = absoluteUrl(
	"/.well-known/mcp/server-card.json",
);
export const OAUTH_PROTECTED_RESOURCE_URL = absoluteUrl(
	"/.well-known/oauth-protected-resource",
);

const supabaseBaseUrl = normalizeSupabaseBaseUrl(
	process.env.NEXT_PUBLIC_SUPABASE_URL ??
		process.env.SUPABASE_URL ??
		DEFAULT_SUPABASE_BASE_URL,
);

export const OAUTH_ISSUER = `${supabaseBaseUrl}/auth/v1`;
export const OAUTH_AUTHORIZATION_ENDPOINT = `${OAUTH_ISSUER}/oauth/authorize`;
export const OAUTH_TOKEN_ENDPOINT = `${OAUTH_ISSUER}/oauth/token`;
export const OAUTH_JWKS_URI = `${OAUTH_ISSUER}/.well-known/jwks.json`;
export const OAUTH_SCOPES_SUPPORTED = [
	"openid",
	"email",
	"profile",
	"gateway:access",
] as const;
export const CONTENT_SIGNAL_VALUE = "ai-train=no, search=yes, ai-input=yes";

export const HOME_LINK_HEADER = [
	`</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
	`<${API_DOCS_URL}>; rel="service-doc"; type="text/html"`,
	`<${AGENT_SKILLS_INDEX_URL}>; rel="describedby"; type="application/json"`,
].join(", ");

type PublishedSkill = {
	description: string;
	name: string;
	slug: string;
	type: string;
};

const PUBLISHED_SKILLS: PublishedSkill[] = [
	{
		slug: "discover-api-surface",
		name: "discover-api-surface",
		type: "tool",
		description:
			"Locate the Phaseo Gateway API base URL, OpenAPI description, docs, health endpoint, and authentication metadata.",
	},
	{
		slug: "browse-model-catalog",
		name: "browse-model-catalog",
		type: "tool",
		description:
			"Open the public Phaseo model database and provider comparison pages for model research.",
	},
	{
		slug: "open-gateway-quickstart",
		name: "open-gateway-quickstart",
		type: "tool",
		description:
			"Open the gateway quickstart documentation for setup, authentication, and first request examples.",
	},
] as const;

export function estimateMarkdownTokens(markdown: string): string {
	const units = markdown.trim().split(/\s+/).filter(Boolean).length;
	return String(Math.max(1, Math.ceil(units * 1.3)));
}

export function buildHomeMarkdown(): string {
	return `---
title: Phaseo
url: ${SITE_URL}
---

# Phaseo

Phaseo is an open model database and OpenAI-compatible gateway for comparing models, pricing, benchmarks, and provider coverage.

## Primary resources

- Models: ${MODELS_URL}
- Pricing: ${PRICING_URL}
- API quickstart: ${API_QUICKSTART_URL}
- API reference: ${API_DOCS_URL}
- OpenAPI spec: ${API_OPENAPI_URL}
- API base URL: ${API_BASE_URL}
- API health: ${API_HEALTH_URL}

## Agent discovery

- API catalog: ${API_CATALOG_URL}
- Agent skills index: ${AGENT_SKILLS_INDEX_URL}
- MCP server card: ${MCP_SERVER_CARD_URL}
- OAuth protected resource metadata: ${OAUTH_PROTECTED_RESOURCE_URL}
- OAuth authorization server metadata: ${absoluteUrl("/.well-known/oauth-authorization-server")}
- OpenID configuration: ${absoluteUrl("/.well-known/openid-configuration")}

## What the site exposes

- Public model and provider browsing pages
- Pricing and gateway overview pages
- Machine-readable API discovery metadata
- Browser-native WebMCP homepage tools for navigation and API discovery
`;
}

export function buildApiCatalog() {
	return {
		linkset: [
			{
				anchor: API_BASE_URL,
				"service-desc": [
					{
						href: API_OPENAPI_URL,
						type: "application/yaml",
					},
				],
				"service-doc": [
					{
						href: API_DOCS_URL,
						type: "text/html",
					},
				],
				status: [
					{
						href: API_HEALTH_URL,
						type: "application/json",
					},
				],
			},
		],
	};
}

export function buildOAuthProtectedResourceMetadata() {
	return {
		resource: API_BASE_URL,
		authorization_servers: [OAUTH_ISSUER],
		scopes_supported: ["gateway:access"],
		bearer_methods_supported: ["header"],
	};
}

export function buildOAuthAuthorizationServerMetadata() {
	return {
		issuer: OAUTH_ISSUER,
		authorization_endpoint: OAUTH_AUTHORIZATION_ENDPOINT,
		token_endpoint: OAUTH_TOKEN_ENDPOINT,
		jwks_uri: OAUTH_JWKS_URI,
		grant_types_supported: ["authorization_code", "refresh_token"],
		response_types_supported: ["code"],
		response_modes_supported: ["query"],
		scopes_supported: [...OAUTH_SCOPES_SUPPORTED],
		code_challenge_methods_supported: ["S256"],
		token_endpoint_auth_methods_supported: [
			"client_secret_basic",
			"client_secret_post",
			"none",
		],
	};
}

export function buildOpenIdConfiguration() {
	return {
		...buildOAuthAuthorizationServerMetadata(),
		subject_types_supported: ["public"],
		id_token_signing_alg_values_supported: ["RS256"],
		claims_supported: ["sub", "iss", "aud", "exp", "iat", "email", "profile"],
	};
}

function buildSkillDocument(skill: PublishedSkill) {
	switch (skill.slug) {
		case "discover-api-surface":
			return {
				name: skill.name,
				type: skill.type,
				description: skill.description,
				endpoints: {
					api_base_url: API_BASE_URL,
					api_catalog_url: API_CATALOG_URL,
					api_docs_url: API_DOCS_URL,
					openapi_url: API_OPENAPI_URL,
					health_url: API_HEALTH_URL,
					oauth_protected_resource_url: OAUTH_PROTECTED_RESOURCE_URL,
				},
				instructions: [
					"Use the API catalog first for machine-readable discovery.",
					"Use the OpenAPI description for endpoint schemas.",
					"Use the health endpoint for basic availability checks.",
				],
			};
		case "browse-model-catalog":
			return {
				name: skill.name,
				type: skill.type,
				description: skill.description,
				endpoints: {
					models_url: MODELS_URL,
					pricing_url: PRICING_URL,
					api_providers_url: absoluteUrl("/api-providers"),
				},
				instructions: [
					"Open the models page to browse public model entries.",
					"Open the API providers page to compare provider coverage and pricing context.",
				],
			};
		case "open-gateway-quickstart":
			return {
				name: skill.name,
				type: skill.type,
				description: skill.description,
				endpoints: {
					quickstart_url: API_QUICKSTART_URL,
					api_reference_url: API_DOCS_URL,
					api_base_url: API_BASE_URL,
				},
				instructions: [
					"Open the quickstart before generating example requests.",
					"Use the API reference for endpoint-specific details after the quickstart.",
				],
			};
		default:
			return {
				name: skill.name,
				type: skill.type,
				description: skill.description,
			};
	}
}

export function getAgentSkillDocument(slug: string) {
	const skill = PUBLISHED_SKILLS.find((entry) => entry.slug === slug);
	if (!skill) return null;

	return {
		$schema: "https://agentskills.io/schemas/skill-v0.2.json",
		...buildSkillDocument(skill),
		url: absoluteUrl(`/.well-known/agent-skills/${skill.slug}`),
	};
}

export function getAgentSkillsIndex() {
	return {
		$schema: "https://agentskills.io/schemas/index-v0.2.json",
		skills: PUBLISHED_SKILLS.map((skill) => {
			const document = getAgentSkillDocument(skill.slug);
			const serialized = JSON.stringify(document);
			return {
				name: skill.name,
				type: skill.type,
				description: skill.description,
				url: absoluteUrl(`/.well-known/agent-skills/${skill.slug}`),
				sha256: createHash("sha256").update(serialized).digest("hex"),
			};
		}),
	};
}

export function buildMcpServerCard() {
	return {
		serverInfo: {
			name: "Phaseo WebMCP",
			version: "1.0.0",
		},
		transports: [
			{
				type: "webmcp",
				url: SITE_URL,
				description:
					"Homepage-level browser tools exposed through navigator.modelContext for AI agents running in compatible browsers.",
			},
		],
		capabilities: {
			tools: {
				listChanged: false,
			},
			resources: {
				subscribe: false,
				listChanged: false,
			},
			prompts: {
				listChanged: false,
			},
		},
	};
}
