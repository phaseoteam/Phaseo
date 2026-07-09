export const AI_STATS_GATEWAY_BASE_URL = "https://api.phaseo.app/v1";

export type ApiKeyPresetId = "development" | "production" | "ci" | "sandbox";

export type ApiKeyLimitPreset = {
	id: ApiKeyPresetId;
	label: string;
	description: string;
	limits: {
		dailyRequests: number;
		weeklyRequests: number;
		monthlyRequests: number;
		dailyCostNanos: number;
		weeklyCostNanos: number;
		monthlyCostNanos: number;
	};
};

export const API_KEY_LIMIT_PRESETS: ApiKeyLimitPreset[] = [
	{
		id: "development",
		label: "Development",
		description: "Low daily spend cap for local apps and prototypes.",
		limits: {
			dailyRequests: 1_000,
			weeklyRequests: 0,
			monthlyRequests: 0,
			dailyCostNanos: 1_000_000_000,
			weeklyCostNanos: 0,
			monthlyCostNanos: 0,
		},
	},
	{
		id: "production",
		label: "Production",
		description: "No preset caps. Add limits later if you need them.",
		limits: {
			dailyRequests: 0,
			weeklyRequests: 0,
			monthlyRequests: 0,
			dailyCostNanos: 0,
			weeklyCostNanos: 0,
			monthlyCostNanos: 0,
		},
	},
	{
		id: "ci",
		label: "CI",
		description: "Request cap for tests, evals, and release jobs.",
		limits: {
			dailyRequests: 5_000,
			weeklyRequests: 25_000,
			monthlyRequests: 0,
			dailyCostNanos: 2_000_000_000,
			weeklyCostNanos: 10_000_000_000,
			monthlyCostNanos: 0,
		},
	},
	{
		id: "sandbox",
		label: "Sandbox",
		description: "Tight cap for demos, trials, and shared experiments.",
		limits: {
			dailyRequests: 100,
			weeklyRequests: 1_000,
			monthlyRequests: 0,
			dailyCostNanos: 250_000_000,
			weeklyCostNanos: 1_000_000_000,
			monthlyCostNanos: 0,
		},
	},
];

export function getApiKeyPreset(id: ApiKeyPresetId): ApiKeyLimitPreset {
	return (
		API_KEY_LIMIT_PRESETS.find((preset) => preset.id === id) ??
		API_KEY_LIMIT_PRESETS[0]
	);
}

type SecretConfigArgs = {
	apiKey: string;
	baseUrl?: string;
	envVarName?: string;
};

function normalizeBaseUrl(baseUrl?: string): string {
	return (baseUrl || AI_STATS_GATEWAY_BASE_URL).replace(/\/+$/, "");
}

export function buildEnvFile(args: SecretConfigArgs): string {
	const envVarName = args.envVarName || "AI_STATS_API_KEY";
	return `${envVarName}="${args.apiKey}"\nAI_STATS_BASE_URL="${normalizeBaseUrl(args.baseUrl)}"\n`;
}

export type AppConfigSnippet = {
	id: string;
	label: string;
	value: string;
};

export function buildAppConfigSnippets(args: SecretConfigArgs): AppConfigSnippet[] {
	const baseUrl = normalizeBaseUrl(args.baseUrl);
	const apiKey = args.apiKey;

	return [
		{
			id: "shell",
			label: "Shell exports",
			value: `export AI_STATS_API_KEY="${apiKey}"\nexport AI_STATS_BASE_URL="${baseUrl}"`,
		},
		{
			id: "openai-node",
			label: "OpenAI SDK (Node)",
			value: `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  apiKey: process.env.AI_STATS_API_KEY,\n  baseURL: "${baseUrl}",\n});`,
		},
		{
			id: "openai-python",
			label: "OpenAI SDK (Python)",
			value: `import os\nfrom openai import OpenAI\n\nclient = OpenAI(\n    api_key=os.environ["AI_STATS_API_KEY"],\n    base_url="${baseUrl}",\n)`,
		},
		{
			id: "vercel-ai-sdk",
			label: "Vercel AI SDK",
			value: `import { createOpenAI } from "@ai-sdk/openai";\n\nexport const aiStats = createOpenAI({\n  apiKey: process.env.AI_STATS_API_KEY,\n  baseURL: "${baseUrl}",\n});`,
		},
		{
			id: "codex",
			label: "Codex",
			value: `[model_providers.ai-stats]\nname = "AI Stats"\nbase_url = "${baseUrl}"\nenv_key = "AI_STATS_API_KEY"`,
		},
		{
			id: "claude-code",
			label: "Claude Code",
			value: `export ANTHROPIC_BASE_URL="${baseUrl.replace(/\/v1$/, "")}"\nexport ANTHROPIC_AUTH_TOKEN="${apiKey}"\nexport ANTHROPIC_API_KEY=""`,
		},
		{
			id: "opencode",
			label: "OpenCode",
			value: `{\n  "provider": {\n    "ai-stats": {\n      "npm": "@ai-sdk/openai-compatible",\n      "options": {\n        "baseURL": "${baseUrl}",\n        "apiKey": "{env:AI_STATS_API_KEY}"\n      }\n    }\n  }\n}`,
		},
	];
}

export type CollectionExport = {
	id: string;
	label: string;
	filename: string;
	mimeType: string;
	content: string;
};

export function buildCollectionExports(baseUrl = AI_STATS_GATEWAY_BASE_URL): CollectionExport[] {
	const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
	const origin = normalizedBaseUrl.replace(/\/v1$/, "");

	return [
		{
			id: "postman",
			label: "Postman",
			filename: "ai-stats-gateway.postman_collection.json",
			mimeType: "application/json",
			content: JSON.stringify(
				{
					info: {
						name: "AI Stats Gateway",
						schema:
							"https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
					},
					variable: [
						{ key: "base_url", value: normalizedBaseUrl },
						{ key: "api_key", value: "paste-your-ai-stats-key" },
						{ key: "model", value: "openai/gpt-4.1-mini" },
					],
					item: [
						{
							name: "List models",
							request: {
								method: "GET",
								header: [
									{ key: "Authorization", value: "Bearer {{api_key}}" },
								],
								url: "{{base_url}}/models?endpoints=chat/completions",
							},
						},
						{
							name: "Chat completion",
							request: {
								method: "POST",
								header: [
									{ key: "Authorization", value: "Bearer {{api_key}}" },
									{ key: "Content-Type", value: "application/json" },
								],
								url: "{{base_url}}/chat/completions",
								body: {
									mode: "raw",
									raw: JSON.stringify(
										{
											model: "{{model}}",
											messages: [
												{
													role: "user",
													content: "Say hello from AI Stats.",
												},
											],
										},
										null,
										2,
									),
								},
							},
						},
					],
				},
				null,
				2,
			),
		},
		{
			id: "insomnia",
			label: "Insomnia",
			filename: "ai-stats-gateway.insomnia.json",
			mimeType: "application/json",
			content: JSON.stringify(
				{
					_type: "export",
					__export_format: 4,
					__export_source: "ai-stats",
					resources: [
						{
							_id: "wrk_ai_stats_gateway",
							_type: "workspace",
							name: "AI Stats Gateway",
						},
						{
							_id: "env_ai_stats_gateway",
							_type: "environment",
							parentId: "wrk_ai_stats_gateway",
							name: "Base Environment",
							data: {
								base_url: normalizedBaseUrl,
								api_key: "paste-your-ai-stats-key",
								model: "openai/gpt-4.1-mini",
							},
						},
						{
							_id: "req_ai_stats_models",
							_type: "request",
							parentId: "wrk_ai_stats_gateway",
							name: "List models",
							method: "GET",
							url: "{{ _.base_url }}/models?endpoints=chat/completions",
							headers: [
								{
									name: "Authorization",
									value: "Bearer {{ _.api_key }}",
								},
							],
						},
						{
							_id: "req_ai_stats_chat",
							_type: "request",
							parentId: "wrk_ai_stats_gateway",
							name: "Chat completion",
							method: "POST",
							url: "{{ _.base_url }}/chat/completions",
							headers: [
								{
									name: "Authorization",
									value: "Bearer {{ _.api_key }}",
								},
								{ name: "Content-Type", value: "application/json" },
							],
							body: {
								mimeType: "application/json",
								text: JSON.stringify(
									{
										model: "{{ _.model }}",
										messages: [
											{
												role: "user",
												content: "Say hello from AI Stats.",
											},
										],
									},
									null,
									2,
								),
							},
						},
					],
				},
				null,
				2,
			),
		},
		{
			id: "http",
			label: ".http file",
			filename: "ai-stats-gateway.http",
			mimeType: "text/plain",
			content: `@baseUrl = ${normalizedBaseUrl}\n@apiKey = paste-your-ai-stats-key\n@model = openai/gpt-4.1-mini\n\n### List models\nGET {{baseUrl}}/models?endpoints=chat/completions\nAuthorization: Bearer {{apiKey}}\n\n### Chat completion\nPOST {{baseUrl}}/chat/completions\nAuthorization: Bearer {{apiKey}}\nContent-Type: application/json\nOrigin: ${origin}\n\n{\n  "model": "{{model}}",\n  "messages": [\n    {\n      "role": "user",\n      "content": "Say hello from AI Stats."\n    }\n  ]\n}\n`,
		},
	];
}
