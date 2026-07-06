import type { ShikiLang } from "@/components/(data)/model/quickstart/shiki";

const PHASEO_BASE_URL = "https://api.phaseo.app/v1";

export type MigrationCodeSnippet = {
	label: string;
	lang: ShikiLang;
	code: string;
};

export type MigrationScreenshotCheckpoint = {
	title: string;
	description: string;
	suggestedAssetPath: string;
};

export type MigrationSection = {
	id: string;
	title: string;
	paragraphs: string[];
	checklist?: string[];
	codeSnippets?: MigrationCodeSnippet[];
	screenshots?: MigrationScreenshotCheckpoint[];
};

export type MigrationFaq = {
	question: string;
	answer: string;
};

export type MigrationPost = {
	slug: string;
	title: string;
	seoTitle: string;
	description: string;
	excerpt: string;
	sourceLabel: string;
	readTimeMinutes: number;
	updatedAt: string;
	keywords: string[];
	prerequisites: string[];
	sections: MigrationSection[];
	validationSteps: string[];
	faq: MigrationFaq[];
};

export const MIGRATION_POSTS: MigrationPost[] = [
	{
		slug: "openrouter",
		title: "Migrating from OpenRouter to Phaseo Gateway",
		seoTitle: "Migrating from OpenRouter to Phaseo Gateway: Complete Walkthrough",
		description:
			"Move from OpenRouter to Phaseo Gateway with a safe rollout plan, code-level before/after examples, model-ID checks, and validation commands for non-streaming and streaming traffic.",
		excerpt:
			"Step-by-step OpenRouter migration with model mapping, header cleanup, and production rollout guidance.",
		sourceLabel: "OpenRouter",
		readTimeMinutes: 12,
		updatedAt: "2026-04-09",
		keywords: [
			"OpenRouter migration",
			"migrate OpenRouter to Phaseo",
			"AI gateway migration",
			"OpenAI compatible migration",
		],
		prerequisites: [
			"Access to your current OpenRouter integration code and deployment config.",
			"A Phaseo API key stored as `PHASEO_API_KEY` in each target environment.",
			"A list of production model IDs currently used by your application.",
		],
		sections: [
			{
				id: "scope",
				title: "1) Inventory current OpenRouter usage",
				paragraphs: [
					"Start by identifying every place OpenRouter is referenced: endpoint URLs, keys, model IDs, and provider-specific headers.",
					"Keeping the migration boundary small lowers risk. Usually, updating one gateway client module is enough.",
				],
				checklist: [
					"Find `openrouter.ai` endpoint references.",
					"Find `OPENROUTER_API_KEY` usage in code, CI, and hosting env vars.",
					"Find OpenRouter-only headers such as `HTTP-Referer` and `X-Title`.",
					"Document currently used model IDs and any fallback chain logic.",
				],
				screenshots: [
					{
						title: "Repository search results",
						description:
							"Capture your code search showing all OpenRouter references before changes.",
						suggestedAssetPath: "/migrate/openrouter/01-openrouter-search.png",
					},
				],
			},
			{
				id: "code-switch",
				title: "2) Switch base URL and credentials",
				paragraphs: [
					"Replace the OpenRouter base URL with Phaseo and move authentication to `PHASEO_API_KEY`.",
					"Keep request payload shape unchanged first. Do behavior parity before optimization.",
				],
				codeSnippets: [
					{
						label: "Before (OpenRouter + OpenAI SDK)",
						lang: "ts",
						code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const response = await client.chat.completions.create({
  model: "openai/gpt-4.1-mini",
  messages: [{ role: "user", content: "Summarize our migration plan." }],
});`,
					},
					{
						label: "After (Phaseo Gateway + OpenAI SDK)",
						lang: "ts",
						code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "${PHASEO_BASE_URL}",
});

const response = await client.chat.completions.create({
  model: "openai/gpt-4.1-mini",
  messages: [{ role: "user", content: "Summarize our migration plan." }],
});`,
					},
					{
						label: "Environment variable rename",
						lang: "bash",
						code: `# Before
OPENROUTER_API_KEY=...

# After
PHASEO_API_KEY=...`,
					},
				],
				screenshots: [
					{
						title: "Environment variable update",
						description:
							"Capture your hosting dashboard after adding `PHASEO_API_KEY` and removing `OPENROUTER_API_KEY`.",
						suggestedAssetPath: "/migrate/openrouter/02-env-vars.png",
					},
				],
			},
			{
				id: "models",
				title: "3) Validate model IDs and remove OpenRouter-specific behavior",
				paragraphs: [
					"Do not assume every old model alias is valid. Query `/v1/models` and verify each production model ID.",
					"If your app consumed OpenRouter-specific response fields, adapt at one compatibility layer instead of changing every caller.",
				],
				codeSnippets: [
					{
						label: "Check model list from Phaseo",
						lang: "bash",
						code: `curl -s "${PHASEO_BASE_URL}/models" \\
  -H "Authorization: Bearer $PHASEO_API_KEY" | jq '.data[0:10] | map(.id)'`,
					},
					{
						label: "Optional model alias compatibility map",
						lang: "ts",
						code: `const MODEL_ALIASES: Record<string, string> = {
  "openai/gpt-4.1-mini": "openai/gpt-4.1-mini",
  "anthropic/claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
};

export function resolveModelId(input: string): string {
  return MODEL_ALIASES[input] ?? input;
}`,
					},
				],
				checklist: [
					"Keep `Authorization: Bearer` format unchanged.",
					"Retain attribution headers only if you still need them for analytics.",
					"Test both non-streaming and streaming chat paths before rollout.",
				],
			},
			{
				id: "rollout",
				title: "4) Roll out safely",
				paragraphs: [
					"Use a staged rollout: dev first, then a small production slice, then full traffic once metrics are stable.",
					"Track latency, error rate, and token/cost drift. Roll back by switching only endpoint+key config if needed.",
				],
				checklist: [
					"Start with internal traffic only.",
					"Move to 5-10% production traffic and compare quality/cost metrics.",
					"Promote to 100% after parity is confirmed.",
				],
				screenshots: [
					{
						title: "Production canary metrics",
						description:
							"Capture dashboard or logs showing error rate and latency during canary rollout.",
						suggestedAssetPath: "/migrate/openrouter/03-canary-metrics.png",
					},
				],
			},
		],
		validationSteps: [
			`curl -s "${PHASEO_BASE_URL}/health"`,
			`curl -s "${PHASEO_BASE_URL}/models" -H "Authorization: Bearer $PHASEO_API_KEY"`,
			`curl -s "${PHASEO_BASE_URL}/chat/completions" -H "Content-Type: application/json" -H "Authorization: Bearer $PHASEO_API_KEY" -d '{"model":"openai/gpt-4.1-mini","messages":[{"role":"user","content":"Say hello"}]}'`,
			"Run one streaming request through your app-level integration test.",
			"Run one negative test (invalid key or invalid model) to verify failure handling.",
		],
		faq: [
			{
				question: "Do I need to rewrite prompts or message payloads?",
				answer:
					"No. Most teams keep payloads the same and only switch base URL, key source, and optional model alias mapping.",
			},
			{
				question: "Can I keep provider-prefixed model IDs?",
				answer:
					"Often yes, but verify against `/v1/models`. If your existing aliases differ, normalize them in one boundary function.",
			},
		],
	},
	{
		slug: "vercel-ai-gateway",
		title: "Migrating from Vercel AI Gateway to Phaseo Gateway",
		seoTitle:
			"Migrating from Vercel AI Gateway to Phaseo Gateway: Step-by-Step Guide",
		description:
			"Replace Vercel AI Gateway routing with Phaseo Gateway while preserving app behavior, with examples for AI SDK/OpenAI-style integrations and rollout validation.",
		excerpt:
			"Move from Vercel AI Gateway with minimal app changes, clear config swaps, and safe production rollout checks.",
		sourceLabel: "Vercel AI Gateway",
		readTimeMinutes: 11,
		updatedAt: "2026-04-09",
		keywords: [
			"Vercel AI Gateway migration",
			"AI SDK gateway migration",
			"migrate to Phaseo Gateway",
		],
		prerequisites: [
			"Current Vercel AI Gateway base URL and key configuration.",
			"`PHASEO_API_KEY` added to local/dev/staging/prod environments.",
			"A short list of critical prompts or endpoints for parity tests.",
		],
		sections: [
			{
				id: "inventory",
				title: "1) Document your current gateway boundary",
				paragraphs: [
					"Find the single place where your app creates model providers or API clients. That is the preferred migration point.",
					"Capture existing retry, timeout, and fallback behavior so migration stays behaviorally equivalent.",
				],
				checklist: [
					"Locate provider/client factory.",
					"List model IDs currently used in production.",
					"Record retry and timeout defaults.",
				],
			},
			{
				id: "swap",
				title: "2) Swap gateway endpoint and key",
				paragraphs: [
					"For OpenAI-compatible client paths, this is usually a base URL + key replacement only.",
					"If your app has both server and edge runtimes, update both env scopes.",
				],
				codeSnippets: [
					{
						label: "Before (gateway endpoint)",
						lang: "ts",
						code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY,
  baseURL: "https://ai-gateway.vercel.sh/v1",
});`,
					},
					{
						label: "After (Phaseo gateway endpoint)",
						lang: "ts",
						code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "${PHASEO_BASE_URL}",
});`,
					},
					{
						label: "Vercel AI SDK style provider switch",
						lang: "ts",
						code: `import { generateText } from "ai";
import { createPhaseo } from "@phaseo/ai-sdk-provider";

const phaseo = createPhaseo({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "${PHASEO_BASE_URL}",
});

const { text } = await generateText({
  model: phaseo("openai/gpt-4.1-mini"),
  prompt: "Generate a migration checklist.",
});`,
					},
				],
				screenshots: [
					{
						title: "Vercel project environment settings",
						description:
							"Capture the Vercel environment variables panel showing the new key name.",
						suggestedAssetPath: "/migrate/vercel-ai-gateway/01-vercel-env.png",
					},
				],
			},
			{
				id: "parity",
				title: "3) Confirm behavior parity",
				paragraphs: [
					"Run the same prompt set against old and new paths, then compare latency, output format, and token usage.",
					"Keep any gateway-specific metadata adaptation in one adapter so callers stay unchanged.",
				],
				checklist: [
					"Verify tool-calling paths if your app depends on them.",
					"Verify streaming chunks are handled exactly as before.",
					"Confirm application-level error mapping is unchanged.",
				],
			},
			{
				id: "release",
				title: "4) Release plan for low risk",
				paragraphs: [
					"Ship behind a feature flag or traffic percentage to support rapid rollback.",
					"Monitor live metrics and keep both configs available for one release window.",
				],
				screenshots: [
					{
						title: "Feature flag / canary control",
						description:
							"Capture your rollout control surface (flag dashboard, config panel, or deployment variable).",
						suggestedAssetPath: "/migrate/vercel-ai-gateway/02-rollout-flag.png",
					},
				],
			},
		],
		validationSteps: [
			`curl -s "${PHASEO_BASE_URL}/health"`,
			"Run your app's primary text generation integration test.",
			"Run one app-level streaming test in staging.",
			"Compare old/new outputs for your top 10 prompts before full rollout.",
		],
		faq: [
			{
				question: "Do I need to replace the AI SDK?",
				answer:
					"No. Most migrations keep the same SDK and only swap provider configuration to point at Phaseo.",
			},
			{
				question: "What if my app uses edge runtimes and server runtimes?",
				answer:
					"Apply the env var/key update in both runtime scopes and validate both execution paths before promoting.",
			},
		],
	},
	{
		slug: "requesty",
		title: "Migrating from Requesty to Phaseo Gateway",
		seoTitle: "Migrating from Requesty to Phaseo Gateway: Practical Migration Guide",
		description:
			"Migrate from Requesty to Phaseo Gateway with an OpenAI-compatible approach: endpoint/key swap, model compatibility checks, and production validation.",
		excerpt:
			"A practical migration guide for Requesty users moving to Phaseo with minimal code changes.",
		sourceLabel: "Requesty",
		readTimeMinutes: 10,
		updatedAt: "2026-04-09",
		keywords: [
			"Requesty migration",
			"OpenAI compatible gateway migration",
			"migrate Requesty to Phaseo",
		],
		prerequisites: [
			"Your current Requesty client configuration and env vars.",
			"`PHASEO_API_KEY` available in all deployment environments.",
			"A baseline of current latency/error metrics for comparison.",
		],
		sections: [
			{
				id: "baseline",
				title: "1) Capture baseline behavior",
				paragraphs: [
					"Before changing config, capture representative prompt outputs, latency, and error behavior from your current Requesty setup.",
					"This baseline gives you objective pass/fail criteria after migration.",
				],
				checklist: [
					"Save responses for a small golden prompt set.",
					"Record median latency and error rate.",
					"Document current fallback model behavior.",
				],
			},
			{
				id: "endpoint",
				title: "2) Replace endpoint and credentials",
				paragraphs: [
					"Treat this as an OpenAI-compatible migration. Keep payload shape first and only update endpoint + API key source.",
					"Move old Requesty key names to `PHASEO_API_KEY` to standardize runtime config.",
				],
				codeSnippets: [
					{
						label: "Before (Requesty-style OpenAI-compatible client)",
						lang: "ts",
						code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.REQUESTY_API_KEY,
  baseURL: "https://router.requesty.ai/v1",
});`,
					},
					{
						label: "After (Phaseo gateway)",
						lang: "ts",
						code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "${PHASEO_BASE_URL}",
});`,
					},
				],
				screenshots: [
					{
						title: "Secrets rotation",
						description:
							"Capture your deployment secret manager after switching from Requesty key names to `PHASEO_API_KEY`.",
						suggestedAssetPath: "/migrate/requesty/01-secret-rotation.png",
					},
				],
			},
			{
				id: "models",
				title: "3) Verify model availability and normalize IDs",
				paragraphs: [
					"Check that your existing model IDs are valid in Phaseo. If needed, centralize mapping in one resolver function.",
					"Avoid ad-hoc replacements throughout the codebase; keep migration edits reversible.",
				],
				codeSnippets: [
					{
						label: "Model availability check",
						lang: "bash",
						code: `curl -s "${PHASEO_BASE_URL}/models" \\
  -H "Authorization: Bearer $PHASEO_API_KEY" | jq '.data | length'`,
					},
					{
						label: "Single-boundary model resolver",
						lang: "ts",
						code: `export function resolveGatewayModelId(input: string): string {
  const aliases: Record<string, string> = {
    "gpt-4.1-mini": "openai/gpt-4.1-mini",
  };
  return aliases[input] ?? input;
}`,
					},
				],
			},
			{
				id: "validation",
				title: "4) Run migration validation and promote",
				paragraphs: [
					"Run your golden prompt set and compare output quality, latency, and costs against the baseline.",
					"Promote traffic gradually and keep old config available until stability is confirmed.",
				],
				checklist: [
					"Pass non-streaming and streaming tests.",
					"Compare against baseline metrics from step 1.",
					"Promote gradually and observe for at least one release cycle.",
				],
				screenshots: [
					{
						title: "Before/after metrics report",
						description:
							"Capture the comparison report showing parity or deltas in latency, error rate, and token spend.",
						suggestedAssetPath: "/migrate/requesty/02-metrics-comparison.png",
					},
				],
			},
		],
		validationSteps: [
			`curl -s "${PHASEO_BASE_URL}/health"`,
			`curl -s "${PHASEO_BASE_URL}/models" -H "Authorization: Bearer $PHASEO_API_KEY"`,
			"Replay your golden prompt set through the migrated path.",
			"Verify one invalid-key error path and one invalid-model error path.",
		],
		faq: [
			{
				question: "Can I migrate without changing business logic?",
				answer:
					"Usually yes. Keep changes at the gateway client boundary (endpoint, key, and optional model mapping) and leave calling code intact.",
			},
			{
				question: "Does Requesty require provider-prefixed model IDs?",
				answer:
					"Yes for their OpenAI-compatible routing examples (for example `openai/gpt-4o`). Verify your production IDs before cutover.",
			},
			{
				question: "Should I keep old Requesty env vars during rollout?",
				answer:
					"Yes during canary, but plan to remove them after full cutover to prevent config drift.",
			},
		],
	},
	{
		slug: "llmgateway",
		title: "Migrating from LLM Gateway to Phaseo Gateway",
		seoTitle: "Migrating from LLM Gateway to Phaseo Gateway: Complete Guide",
		description:
			"Migrate from LLMGateway to Phaseo Gateway using an OpenAI-compatible flow with endpoint and key migration, model checks, and staged rollout validation.",
		excerpt:
			"Practical migration steps for LLMGateway users who want a low-risk cutover to Phaseo.",
		sourceLabel: "LLM Gateway",
		readTimeMinutes: 10,
		updatedAt: "2026-04-09",
		keywords: [
			"LLMGateway migration",
			"migrate LLM Gateway to Phaseo",
			"AI gateway migration guide",
		],
		prerequisites: [
			"Your existing LLM Gateway endpoint and API key configuration.",
			"`PHASEO_API_KEY` added to dev, staging, and production.",
			"A baseline sample of output quality, latency, and error rate.",
		],
		sections: [
			{
				id: "inventory",
				title: "1) Inventory integration points",
				paragraphs: [
					"Identify the exact files that create and configure your LLM Gateway client.",
					"Map current model IDs, retries, and timeout behavior so you can keep parity after cutover.",
				],
				checklist: [
					"Locate all `LLM_GATEWAY_*` env var usage.",
					"Find all base URL references in runtime config.",
					"Capture currently active model IDs and fallback chains.",
				],
			},
			{
				id: "switch",
				title: "2) Switch endpoint and credentials",
				paragraphs: [
					"Keep payloads unchanged first. Start with a pure endpoint and key migration to reduce risk.",
					"Rename keys to `PHASEO_API_KEY` across local and deployed environments.",
				],
				codeSnippets: [
					{
						label: "Before (LLMGateway style config)",
						lang: "ts",
						code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.LLM_GATEWAY_API_KEY,
  baseURL: "https://api.llmgateway.io/v1",
});`,
					},
					{
						label: "After (Phaseo Gateway)",
						lang: "ts",
						code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "${PHASEO_BASE_URL}",
});`,
					},
				],
				screenshots: [
					{
						title: "Environment key migration",
						description:
							"Capture your environment config after replacing `LLM_GATEWAY_API_KEY` with `PHASEO_API_KEY`.",
						suggestedAssetPath: "/migrate/llmgateway/01-env-migration.png",
					},
				],
			},
			{
				id: "models",
				title: "3) Validate model compatibility",
				paragraphs: [
					"Query the Phaseo model catalog and verify each model used in production.",
					"If aliases differ, implement a single mapping function at the gateway boundary. LLM Gateway examples often use unprefixed IDs like `gpt-4o`, while Phaseo uses provider-prefixed IDs.",
				],
				codeSnippets: [
					{
						label: "Model list check",
						lang: "bash",
						code: `curl -s "${PHASEO_BASE_URL}/models" \\
  -H "Authorization: Bearer $PHASEO_API_KEY" | jq '.data | length'`,
					},
				],
			},
			{
				id: "rollout",
				title: "4) Validate and roll out",
				paragraphs: [
					"Run your golden prompt suite and compare quality, latency, and cost metrics to baseline.",
					"Release behind a canary flag and move from low percentage traffic to full traffic once stable.",
				],
				checklist: [
					"Pass non-streaming and streaming tests.",
					"Verify error handling for invalid key/model scenarios.",
					"Observe production metrics for one release cycle before removing old config.",
				],
				screenshots: [
					{
						title: "Canary rollout metrics",
						description:
							"Capture your canary dashboard showing latency and error rate before full rollout.",
						suggestedAssetPath: "/migrate/llmgateway/02-canary-metrics.png",
					},
				],
			},
		],
		validationSteps: [
			`curl -s "${PHASEO_BASE_URL}/health"`,
			`curl -s "${PHASEO_BASE_URL}/models" -H "Authorization: Bearer $PHASEO_API_KEY"`,
			"Run one non-streaming and one streaming request in staging.",
			"Replay your golden prompts and compare to baseline.",
		],
		faq: [
			{
				question: "Can we keep our current OpenAI client code?",
				answer:
					"Yes. Most teams keep client code and only swap environment variables plus base URL.",
			},
			{
				question: "Do model IDs need to change when migrating from LLM Gateway?",
				answer:
					"Usually yes. If you currently use unprefixed IDs (for example `gpt-4o`), map them to Phaseo provider-prefixed IDs (for example `openai/gpt-4.1-mini`).",
			},
			{
				question: "Should we remove old LLMGateway env vars immediately?",
				answer:
					"Keep them during canary rollout, then remove after stable cutover to avoid configuration drift.",
			},
		],
	},
];

export function getMigrationPosts(): MigrationPost[] {
	return MIGRATION_POSTS;
}

export function getMigrationPost(slug: string): MigrationPost | undefined {
	return MIGRATION_POSTS.find((post) => post.slug === slug);
}
