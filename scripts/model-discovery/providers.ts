import type { Provider } from "./types";

export const providerConfig: Provider[] = [
	{
		id: "openai",
		name: "OpenAI",
		baseUrl: "https://api.openai.com/v1/models",
		envVar: "OPENAI_API_KEY",
		transformResponse: (data: any) =>
			data.data.map((m: any) => `openai/${m.id}`),
	},
	{
		id: "anthropic",
		name: "Anthropic",
		baseUrl: "https://api.anthropic.com/v1/models",
		envVar: "ANTHROPIC_API_KEY",
		headers: { "anthropic-version": "2023-06-01" },
		transformResponse: (data: any) =>
			data.data.map((m: any) => `anthropic/${m.id}`),
	},
	{
		id: "mistral",
		name: "Mistral",
		baseUrl: "https://api.mistral.ai/v1/models",
		envVar: "MISTRAL_API_KEY",
		transformResponse: (data: any) =>
			data.data.map((m: any) => `mistral/${m.id}`),
	},
	{
		id: "x-ai",
		name: "xAI",
		baseUrl: "https://api.x.ai/v1/models",
		envVar: "XAI_API_KEY",
		transformResponse: (data: any) =>
			data.data.map((m: any) => `x-ai/${m.id}`),
	},
	{
		id: "deepseek",
		name: "DeepSeek",
		baseUrl: "https://api.deepseek.com/models",
		envVar: "DEEEPSEEK_API_KEY",
		transformResponse: (data: any) =>
			data.data.map((m: any) => `deepseek/${m.id}`),
	},
	{
		id: "novitaai",
		name: "NovitaAI",
		baseUrl: "https://api.novita.ai/v3/openai/v1/models",
		envVar: "NOVITA_API_KEY",
		transformResponse: (data: any) =>
			data.data.map((m: any) => `novitaai/${m.id}`),
	},
	{
		id: "google-ai-studio",
		name: "Google AI Studio",
		baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
		envVar: "GOOGLE_API_KEY",
		queryParams: { key: true },
		transformResponse: (data: any) =>
			data.models.map((m: any) => `google/${m.name.split("/")[1]}`),
	},
	{
		id: "cohere",
		name: "Cohere",
		baseUrl: "https://api.cohere.ai/v1/models",
		envVar: "COHERE_API_KEY",
		transformResponse: (data: any) =>
			data.data.map((m: any) => `cohere/${m.id}`),
	},
	{
		id: "groq",
		name: "Groq",
		baseUrl: "https://api.groq.com/openai/v1/models",
		envVar: "GROQ_API_KEY",
		transformResponse: (data: any) =>
			data.data.map((m: any) => `groq/${m.id}`),
	},
	{
		id: "cerebras",
		name: "Cerebras",
		baseUrl: "https://api.cerebras.ai/v1/models",
		envVar: "CEREBRAS_API_KEY",
		transformResponse: (data: any) =>
			data.data.map((m: any) => `cerebras/${m.id}`),
	},
	{
		id: "siliconflow",
		name: "SiliconFlow",
		baseUrl: "https://api.siliconflow.ai/v1/models",
		envVar: "SILICONFLOW_API_KEY",
		transformResponse: (data: any) =>
			data.data.map((m: any) => `siliconflow/${m.id}`),
	},
	{
		id: "together",
		name: "Together AI",
		baseUrl: "https://api.together.ai/models",
		envVar: "TOGETHER_API_KEY",
		transformResponse: (data: any) =>
			data.data.map((m: any) => `together/${m.id}`),
	},
	{
		id: "moonshot-ai",
		name: "Moonshot AI",
		baseUrl: "https://api.moonshot.cn/v1/models",
		envVar: "MOONSHOT_API_KEY",
		transformResponse: (data: any) =>
			data.data.map((m: any) => `moonshot-ai/${m.id}`),
	},
	{
		id: "chutes",
		name: "Chutes",
		baseUrl: "https://api.chutes.ai/v1/models",
		envVar: "CHUTES_API_KEY",
		transformResponse: (data: any) =>
			data.data.map((m: any) => `chutes/${m.id}`),
	},
	{
		id: "fireworks",
		name: "Fireworks AI",
		baseUrl: "https://api.fireworks.ai/v1/accounts/{account_id}/models",
		envVar: ["FIREWORKS_API_KEY", "FIREWORKS_ACCOUNT_ID"],
		transformResponse: (data: any) =>
			data.data.map((m: any) => `fireworks/${m.id}`),
	},
	{
		id: "cloudflare",
		name: "Cloudflare",
		baseUrl: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/models/search",
		envVar: ["CF_API_TOKEN", "CF_ACCOUNT_ID"],
		method: "POST",
		body: {},
		transformResponse: (data: any) =>
			data.result.data.map((m: any) => `cloudflare/${m.name}`),
	},
	{
		id: "bedrock",
		name: "Amazon Bedrock",
		baseUrl: "aws-bedrock",
		envVar: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
		isAwsService: true,
		transformResponse: (data: any) =>
			(data.modelSummaries ?? []).map((m: any) => `bedrock/${m.modelId}`),
	},
	{
		id: "azure",
		name: "Azure OpenAI",
		baseUrl: "{endpoint}/openai/models",
		envVar: ["AZURE_API_KEY", "AZURE_ENDPOINT"],
		queryParams: { "api-version": "2024-10-21" },
		transformResponse: (data: any) =>
			data.data.map((m: any) => `azure/${m.id}`),
	},
];

export const providerSlugMap: Record<string, string> = {
	"google-ai-studio": "google",
};
