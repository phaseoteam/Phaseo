// Prompt-first quick start: one prompt a developer pastes into their coding
// agent. The agent works out the project's language, sets Phaseo up and makes
// a first request. The docs quickstart (apps/docs/<locale>/v1/quickstart.mdx)
// embeds the same prompt for phaseo/free; agentPrompt.test.ts keeps them in sync.

const DOCS = "https://phaseo.app/docs";
const API_BASE = "https://api.phaseo.app/v1";
const KEYS_URL = "https://phaseo.app/settings/keys";
const INSTALL_DOCS = `${DOCS}/v1/sdk-reference/client/installation.md`;

export interface AgentPromptOptions {
	modelId: string;
	/** Gateway path without the /v1 prefix, for example "/responses". */
	endpointPath?: string | null;
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

export function buildAgentPrompt({ modelId, endpointPath }: AgentPromptOptions): string {
	const path = endpointPath ?? "/responses";
	const task = (TASK_BY_PATH[path] ?? "calls {model} and returns the result").replace(
		"{model}",
		modelId,
	);

	return [
		`Add Phaseo to this project and make a first request to ${modelId}.`,
		"",
		`1. Work out the project's language and package manager, then install the official Phaseo SDK with it: @phaseo/sdk (Node.js 18+), phaseo (Python 3.10+), github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v3 (Go 1.23+), Phaseo.Sdk (.NET 8+), phaseo/sdk (PHP 8.1+) or phaseo_sdk (Ruby 3.0+). For Java, follow ${INSTALL_DOCS}. If there is no SDK for the language, call ${API_BASE} with the HTTP client the project already uses. If a release-age policy blocks the install, stop and ask me instead of changing it.`,
		`2. Before writing code, read the SKILL.md that ships with the SDK (node_modules/@phaseo/sdk/SKILL.md, or SKILL.md in the installed phaseo Python package) or, for other languages, ${DOCS}/skill.md. If you support skills, also run \`npx skills@latest add ${DOCS} --skill phaseo-gateway\`.`,
		`3. Add a note to AGENTS.md, creating it if needed: before changing Phaseo code, read those docs, and check model IDs with GET ${API_BASE}/models instead of guessing them.`,
		`4. Read the API key from the PHASEO_API_KEY environment variable in server-side code only. Add PHASEO_API_KEY to the example env file without a value. Never print, commit or ship the key to a browser. If it is not set, ask me to create one at ${KEYS_URL}.`,
		`5. Add a server-side function that ${task}, using POST /v1${path}. Follow the project's existing structure, handle Phaseo error codes, and add a test that mocks the HTTP call.`,
	].join("\n");
}
