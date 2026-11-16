// Prompt-first quick start: one prompt a developer pastes into their coding
// agent. The agent works out the project's language, sets Phaseo up and makes
// a first request. The docs quickstart (apps/docs/<locale>/v1/quickstart.mdx)
// embeds the same prompt for phaseo/free; agentPrompt.test.ts keeps them in sync.

const DOCS = "https://phaseo.app/docs";
const API_BASE = "https://api.phaseo.app/v1";
const KEYS_URL = "https://phaseo.app/settings/keys";
const INSTALL_DOCS = `${DOCS}/v1/sdk-reference/client/installation.md`;

const BYOK_URL = "https://phaseo.app/settings/byok";

export interface AgentPromptOptions {
	modelId: string;
	/** Gateway path without the /v1 prefix, for example "/responses". */
	endpointPath?: string | null;
	/** Service tier picked in the quickstart, when it isn't the default. */
	serviceTier?: string | null;
	/** Routing sort from the page context (sent as provider.sort). */
	providerSort?: string | null;
	/** Providers this model can only run on with the account's own key. */
	byokProviders?: { providerId: string; providerName: string }[];
}

function requestOptionsSentence(serviceTier?: string | null, providerSort?: string | null) {
	const fields = [
		serviceTier ? `"service_tier": ${JSON.stringify(serviceTier)}` : null,
		providerSort ? `"provider": {"sort": ${JSON.stringify(providerSort)}}` : null,
	].filter(Boolean);
	return fields.length ? ` Send ${fields.join(" and ")} in the request body.` : "";
}

function byokSentence(modelId: string, providers: AgentPromptOptions["byokProviders"]) {
	if (!providers?.length) return "";
	const names = providers.map((provider) => provider.providerName).join(" or ");
	const links = providers.map((provider) => `${BYOK_URL}/${provider.providerId}`).join(" or ");
	return ` ${modelId} only runs with your own ${names} key, so if the first request fails because that key is missing, ask me to add it at ${links}.`;
}

const TASK_BY_PATH: Record<string, string> = {
	"/responses": "sends a prompt to {model} and returns the text reply",
	"/chat/completions": "sends a prompt to {model} and returns the text reply",
	"/messages": "sends a prompt to {model} and returns the text reply",
	"/images/generations": "generates an image from a text prompt with {model} and returns it",
	"/images/edits": "edits an uploaded image with {model} from a text instruction and returns the result",
	"/embeddings": "embeds a list of strings with {model} and returns the vectors",
	"/audio/speech": "turns text into speech with {model} and returns the audio",
	"/audio/transcriptions": "transcribes an audio file with {model} and returns the text",
	"/audio/translations": "translates an audio file into English text with {model}",
	"/moderations": "checks a piece of text with {model} and returns whether it was flagged",
	"/video/generations": "starts a {model} video generation from a text prompt, polls until it finishes, and returns the video URL",
};

export function buildAgentPrompt({
	modelId,
	endpointPath,
	serviceTier,
	providerSort,
	byokProviders,
}: AgentPromptOptions): string {
	const path = endpointPath ?? "/responses";
	const task = (TASK_BY_PATH[path] ?? "calls {model} and returns the result").replace(
		"{model}",
		modelId,
	);

	return [
		`Set up Phaseo in this project and make a first request to ${modelId}. If the project already uses Phaseo, review that setup against these steps instead of starting again.`,
		"",
		`1. Check whether the project already uses Phaseo: a Phaseo SDK in its dependencies, PHASEO_API_KEY in its env files, or calls to api.phaseo.app. If it does, keep what already works, reuse the existing client, fix anything that doesn't match the steps below, and don't add a second integration.`,
		`2. If no Phaseo SDK is installed, work out the project's language and package manager, then install the official SDK with it: @phaseo/sdk (Node.js 18+), phaseo (Python 3.10+), github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v3 (Go 1.23+), Phaseo.Sdk (.NET 8+), phaseo/sdk (PHP 8.1+) or phaseo_sdk (Ruby 3.0+). For Java, follow ${INSTALL_DOCS}. If there is no SDK for the language, call ${API_BASE} with the HTTP client the project already uses. If an SDK is installed but behind the latest major version, update it and fix what the upgrade breaks. If a release-age policy blocks an install or update, stop and ask me instead of changing it.`,
		`3. Before writing code, read the SKILL.md that ships with the SDK (node_modules/@phaseo/sdk/SKILL.md, or SKILL.md in the installed phaseo Python package) or, for other languages, ${DOCS}/skill.md. If you support skills, also run \`npx skills@latest add ${DOCS} --skill phaseo-gateway\`.`,
		`4. Add a note to AGENTS.md, creating it or updating an existing note if needed: before changing Phaseo code, read those docs, and check model IDs with GET ${API_BASE}/models instead of guessing them.`,
		`5. Read the API key from the PHASEO_API_KEY environment variable in server-side code only. Add PHASEO_API_KEY to the example env file without a value. Never print, commit or ship the key to a browser; if the existing code does, fix it and tell me. If the key is not set, ask me to create one at ${KEYS_URL}.${byokSentence(modelId, byokProviders)}`,
		`6. If the project already calls ${modelId} through Phaseo, check that code against the docs: the model ID, the endpoint, error handling and a test. Otherwise add a server-side function that ${task}, using POST /v1${path}.${requestOptionsSentence(serviceTier, providerSort)} Follow the project's existing structure, handle Phaseo error codes, and add a test that mocks the HTTP call.`,
		"",
		"When you finish, list what you added, what you changed in an existing setup, and anything I still need to do.",
	].join("\n");
}
