import type { LearnCourse } from "../types";

export const routingCourse: LearnCourse = {
	slug: "routing-and-presets",
	title: "Control routing and fallbacks",
	summary:
		"Choose which providers serve your requests, add fallback models, and save shared settings in a preset.",
	level: "developer",
	format: "Any language",
	prerequisites: ["Make your first request"],
	lessons: [
		{
			slug: "route-across-providers",
			title: "Route across providers",
			summary: "Rank, limit or pin providers, and list fallback models for when they fail.",
			minutes: 10,
			body: `Most models are served by several providers. For each request, Phaseo keeps the providers your rules allow, ranks them and calls the best one. If that provider fails, it tries the next one. The default ranking, \`balanced\`, weighs cost per successful answer.

Shape this with the \`provider\` object (\`routing\` is accepted as an alias):

\`\`\`json
{
  "model": "openai/gpt-5.6-luna",
  "input": "Summarize this changelog.",
  "provider": {
    "order": ["openai", "azure"],
    "sort": "latency",
    "require_zero_data_retention": true
  }
}
\`\`\`

- \`order\` sets a preferred order; \`only\` and \`ignore\` allow or block providers.
- \`sort\` ranks by \`price\`, \`latency\` or \`throughput\`. The model suffixes \`:cheap\`, \`:fast\` and \`:nitro\` do the same and win over \`sort\`.
- \`max_price\` sets price ceilings; \`required_execution_region\`, \`required_data_region\` and \`require_zero_data_retention\` limit where and how data is handled.

To pin one provider with no cross-provider fallback, put it in front of the model ID: \`baseten:thinking-machines/inkling-small\`. For whole-request regional routing, send text requests to \`eu.api.phaseo.app\` or \`us.api.phaseo.app\` instead.

To fall back to other models, list them in \`models\`. Phaseo tries \`model\` first, then each entry in order, but only after the previous model ends in \`429\`, \`500\`, \`502\`, \`503\` or \`504\`. Errors such as \`400\`, \`401\` or \`402\` return straight away. Each attempt is billed as its own request, and the response \`model\` field names the model that answered. A stream falls back only before its first byte.`,
			quiz: {
				question: "You send `\"model\": \"openai/gpt-6-astra\"` with `\"models\": [\"anthropic/claude-sonnet-5.5\"]`. The first model returns `400 validation_error`. What happens?",
				options: [
					"Phaseo returns the 400 straight away and doesn't try the fallback",
					"Phaseo retries the request on `anthropic/claude-sonnet-5.5`",
					"Phaseo retries the same model on another provider, then the fallback",
				],
				answer: 0,
				explanation:
					"Fallback models are tried only after a 429, 500, 502, 503 or 504. A 400 is a problem with the request itself, so it returns immediately; another model would reject it too.",
			},
			scenario: {
				prompt:
					"Your legal team says customer prompts must only go to providers that meet zero data retention, and the app must never touch one particular provider. You don't want to pin a single provider. What do you send?",
				answer:
					"Keep the plain model ID so Phaseo can still fall back between providers, and add `\"provider\": { \"require_zero_data_retention\": true, \"ignore\": [\"<provider-id>\"] }`. Pinning with `provider:model` would turn off cross-provider fallback, which you don't want.",
			},
			takeaway:
				"Use `provider` to rank and limit providers, a `provider:` prefix to pin one, and `models` to fall back to other models on retryable errors.",
			links: [
				{ label: "Routing and fallbacks", href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks" },
				{ label: "Provider parameters", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "Provider-qualified model IDs", href: "https://phaseo.app/docs/v1/guides/provider-qualified-models" },
				{ label: "Regional routing", href: "https://phaseo.app/docs/v1/guides/regional-routing" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "use-a-preset",
			title: "Use a preset",
			summary: "Save a model, prompt and routing rules under one name, and call it from any app.",
			minutes: 7,
			body: `A preset stores the model, system prompt, parameters and provider rules for one job under a name such as \`@support-triage\`. Callers send that name as the \`model\` and only the input. Phaseo fills in the rest before it picks a provider. Create presets under **Settings -> Presets**, or with \`POST /v1/presets\` and a management key.

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "@support-triage",
    "input": "Customer says the invoice total is wrong."
  }'
\`\`\`

There's no separate \`preset\` field. Name a version with \`@support-triage@v3\`, or follow a label with \`@support-triage@production\`, so you can roll back by moving the label.

When the request and the preset both set something, these rules decide:

- **Parameters fill gaps.** A preset's defaults apply only to fields the request leaves out. A value in the request always wins.
- **System prompts stack.** The preset's prompt goes first, then the request's own.
- **Provider settings in the request win.** \`provider.order\` or \`provider.max_price\` in the request replaces the preset's value for that field.
- **Allow lists narrow, never widen.** A model outside the preset's allowed models fails with \`validation_error\`; it isn't rerouted.`,
			quiz: {
				question: "Your preset sets `temperature` to 0.2. A request sends `\"model\": \"@support-triage\"` with `\"temperature\": 0.8`. Which value is used?",
				options: [
					"0.2, because the preset locks its parameters",
					"0.8, because a value in the request always wins",
					"0.5, because Phaseo averages the two values",
				],
				answer: 1,
				explanation:
					"A preset's default parameters fill only the fields a request leaves out. When the request sets a value, the request wins.",
			},
			scenario: {
				prompt:
					"Three services call the same support model with copy-pasted prompts and provider rules. A prompt change shipped to one service but not the others, and answers now differ. How do you stop this happening again?",
				answer:
					"Move the shared model, system prompt and provider rules into one preset and have every service send `\"model\": \"@support-triage@production\"`. Publish changes as new versions and move the `production` label to roll out, or move it back to roll back.",
			},
			takeaway:
				"Put shared settings in a preset, call it by name in `model`, and let request values override preset defaults where you need to.",
			links: [
				{ label: "Presets", href: "https://phaseo.app/docs/v1/guides/presets" },
				{ label: "Prompt templates", href: "https://phaseo.app/docs/v1/guides/prompt-templates" },
				{ label: "Routing and fallbacks", href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks" },
			],
			updated: "2026-11-17",
		},
	],
};
