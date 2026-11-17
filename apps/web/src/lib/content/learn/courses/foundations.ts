import type { LearnCourse } from "../types";

export const foundationsCourse: LearnCourse = {
	slug: "what-is-phaseo",
	title: "What is Phaseo?",
	summary:
		"Learn what Phaseo does, set up your account and first API key, and find the dashboard pages you will use most.",
	level: "beginner",
	format: "No code",
	prerequisites: [],
	lessons: [
		{
			slug: "what-phaseo-is",
			title: "What Phaseo is",
			summary:
				"Phaseo is a gateway: one API and one key in front of many models and the providers that host them.",
			minutes: 6,
			body: `Phaseo is an AI gateway. You send every request to one API, \`https://api.phaseo.app/v1\`, with one key. Phaseo passes each request on to a provider that can serve it, and bills it to your workspace. You can use the Responses, Chat Completions or Messages API shape, whichever your app already speaks.

**Models and providers are different things.** A model is the system that writes the answer. A provider hosts the model and sets its price, speed, availability and supported parameters. One model can have several providers.

**A model ID names the model, not the provider.** IDs look like \`openai/gpt-6-astra\` or \`anthropic/claude-sonnet-5.5\`: the lab, then the model. \`phaseo/free\` picks an available free model and works without credits. If you need one exact provider, you can put it in front of the ID, for example \`baseten:thinking-machines/inkling-small\`.

**How a request is routed:**

1. Phaseo keeps only the providers your workspace settings and request allow.
2. It ranks them. The default mode, \`balanced\`, weighs price, speed and reliability.
3. It calls the top provider. If that provider fails, it tries the next one.
4. If every provider fails with a retryable error and you listed fallback models in \`models\`, it tries the next model.

Fallbacks don't guarantee success, so your app should still retry \`429\` and \`5xx\` errors with backoff. One more thing: the public catalog lists some models that aren't callable yet. Check that a model is **Active on Gateway** before you use its ID.`,
			quiz: {
				question:
					"You call a model that three providers host, and the top-ranked provider returns an error. What does Phaseo do next?",
				options: [
					"It tries the next eligible provider for the same model.",
					"It returns the error straight away, because you chose that provider.",
					"It switches to a different model that it picks for you.",
				],
				answer: 0,
				explanation:
					"When a provider fails, the Gateway tries the next eligible provider for the same model. It only moves to another model if you listed fallback models in `models` and every provider failed with a retryable error.",
			},
			scenario: {
				prompt:
					"A teammate found a model on the Phaseo Models page and copied its ID into a request. The request fails, but the model page looks fine. What is the most likely reason, and how do you check?",
				answer:
					"The catalog lists more models than the Gateway can call. The model may be Coming soon or Not active. On the Models page, the Gateway status filter shows Active on Gateway models by default, and `GET /v1/models` returns only models you can call. Pick a model that is Active on Gateway.",
			},
			takeaway:
				"You choose the model; Phaseo picks a provider that hosts it and falls back to another when one fails.",
			links: [
				{
					label: "How Phaseo works",
					href: "https://phaseo.app/docs/v1/developers/introduction",
				},
				{
					label: "Routing and fallbacks",
					href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks",
				},
				{
					label: "Exploring models",
					href: "https://phaseo.app/docs/v1/exploring/models",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "create-an-account-and-key",
			title: "Create an account and a key",
			summary:
				"Sign up, learn what a workspace owns, and create an API key you keep out of your code.",
			minutes: 7,
			body: `Sign up at phaseo.app with Google, GitHub, GitLab, or an email and password. Every account starts with a personal workspace, which is enough for a small project.

**A workspace is the unit that owns things.** It holds your API keys, routing settings, presets, guardrails and who has admin access. Paid requests use the workspace's credit balance. You can add more workspaces, for example one per product or per environment, after your first credit deposit. Extra workspaces don't change your pricing.

**Create a key** in **Settings → API Keys** and select **Create Key**. Pick the workspace, give the key a name, and choose a preset:

- **Development**: a low daily spend cap for local apps and prototypes.
- **Production**: no preset caps. Add limits later if you need them.
- **CI**: a request cap for tests, evaluations and release jobs.
- **Sandbox**: a tight cap for demos, trials and shared experiments.

Keys can have daily, weekly or monthly request and spend limits. Once a limit is reached, requests with that key return \`429\` with \`key_limit_exceeded\`.

**The key is shown once.** Copy it and store it as an environment variable:

\`\`\`bash
export PHASEO_API_KEY="phaseo_v1_sk_..."
\`\`\`

Treat it like a password. Read it from \`PHASEO_API_KEY\` in server-side code. Never put it in your code, a repository, a browser or mobile app, or a chat with a person or an agent. Use one key per app and environment, so you can replace one without breaking the others, and delete keys you no longer use.`,
			quiz: {
				question: "Where should your Phaseo API key live?",
				options: [
					"In the PHASEO_API_KEY environment variable, read by server-side code.",
					"In your front-end code, so the browser can call Phaseo directly.",
					"In a chat message to your coding agent, so it can finish the setup for you.",
				],
				answer: 0,
				explanation:
					"The docs say to keep keys in server-side code and out of browsers, mobile apps, repositories and chat. Anyone who has the key can spend your workspace's credits.",
			},
			scenario: {
				prompt:
					"You're building a prototype that calls a paid model in a loop. You're worried a bug could run up a bill overnight. What can you do when you create the key?",
				answer:
					"Choose the Development or Sandbox preset, which set a low spend cap, or set a daily spend limit on the key. If the loop hits the limit, requests return 429 with key_limit_exceeded instead of spending more. Use a separate key for production.",
			},
			takeaway:
				"Your workspace owns keys and credits; create one key per app and environment, and keep it in PHASEO_API_KEY on the server.",
			links: [
				{
					label: "Quickstart",
					href: "https://phaseo.app/docs/v1/quickstart",
				},
				{
					label: "Authentication",
					href: "https://phaseo.app/docs/v1/developers/authentication",
				},
				{
					label: "Workspaces",
					href: "https://phaseo.app/docs/v1/guides/workspaces",
				},
				{ label: "API Keys", href: "/settings/keys" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "find-your-way-around",
			title: "Find your way around",
			summary:
				"Learn the handful of pages you'll use first: models, keys, billing, usage, logs and workspace settings.",
			minutes: 6,
			body: `The dashboard has many pages, but you only need a few to start. The settings sidebar groups them into **General** (your account and billing), **Workspace**, **Observe** and **Gateway**. Pages in the last three apply to the workspace picked in the header, so check it before you change anything.

**Before you build:**

- **Models** (\`/models\`): browse models, filter by what they can do, and open one to see its providers, prices and performance. A model with an active route shows a quickstart with the ID to send. **Compare** (\`/compare\`) puts models side by side.
- **API Keys** (\`/settings/keys\`): create, limit and delete keys. **Budgets** (\`/settings/budgets\`) caps spend for the whole workspace.

**Money:**

- **Billing → Billing & Credits** (\`/settings/credits\`): your balance, recent spend, and where you buy credits. Dashboard top-ups start at $5, and Phaseo adds a fee of 5% of the purchase, with a $1 minimum.
- **Billing → Transactions** (\`/settings/credits/transactions\`) lists each purchase.

**After you send requests:**

- **Usage** (\`/settings/usage/overview\`): how your workspace is using Phaseo, with Overview, Trends, Explore and Alerts pages.
- **Logs** (\`/settings/usage/logs/requests\`): one row per request, with its usage, latency, cost and errors. This is the first place to look when something fails.

**Workspace settings:** **Settings** (\`/settings/workspaces/settings\`) for the workspace's general settings and members, **Privacy** (\`/settings/privacy\`) for what is stored, and **Routing** (\`/settings/routing\`) for the default way providers are ranked.`,
			quiz: {
				question:
					"A request failed an hour ago. Where do you see its cost, latency and error?",
				options: [
					"Logs, under Observe in the settings sidebar.",
					"Billing → Transactions.",
					"The API Keys page.",
				],
				answer: 0,
				explanation:
					"Request logs show usage, latency, cost and errors for each request. Transactions only lists credit purchases, and the API Keys page manages keys.",
			},
			scenario: {
				prompt:
					"Your credit balance is dropping faster than you expected, and you want to find out why and stop it happening again. Which pages do you open, in what order?",
				answer:
					"Start with Usage to see when spend went up. Then open Logs to look at the individual requests behind it: which model, how many tokens, what each one cost. Once you know the cause, set a spend limit on the key in API Keys or a workspace budget in Budgets.",
			},
			takeaway:
				"Models to choose, API Keys to connect, Billing to pay, and Usage and Logs to see what happened.",
			links: [
				{ label: "Models", href: "/models" },
				{ label: "Request logs", href: "/settings/usage/logs/requests" },
				{
					label: "Pricing and billing",
					href: "https://phaseo.app/docs/v1/pricing/tiers",
				},
				{
					label: "Key limits and budgets",
					href: "https://phaseo.app/docs/v1/api-reference/limits",
				},
			],
			updated: "2026-11-17",
		},
	],
};
