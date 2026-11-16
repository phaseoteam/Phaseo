// Prompt-first quick start: text a developer pastes into their coding agent
// instead of copying install commands. The docs quickstart
// (apps/docs/v1/quickstart.mdx) embeds the same prompts; agentPrompt.test.ts
// keeps the two in sync.

export type AgentPromptFamilyId =
	| "typescript"
	| "python"
	| "curl"
	| "go"
	| "csharp"
	| "java"
	| "php"
	| "ruby";

const DOCS = "https://phaseo.app/docs";
const API_BASE = "https://api.phaseo.app/v1";
const KEYS_URL = "https://phaseo.app/settings/keys";
const CLIENT_SDK_DOCS = `${DOCS}/v1/sdk-reference/client/installation.md`;

interface FamilySetup {
	projectLabel: string;
	requirement: string;
	install: string;
	localDocs: string | null;
	skill: string;
}

const FAMILY_SETUP: Record<AgentPromptFamilyId, FamilySetup> = {
	typescript: {
		projectLabel: "TypeScript or JavaScript",
		requirement: "It needs Node.js 18 or newer.",
		install: "Install @phaseo/sdk with the project's package manager.",
		localDocs: "node_modules/@phaseo/sdk/SKILL.md",
		skill: "phaseo-sdk-typescript",
	},
	python: {
		projectLabel: "Python",
		requirement: "It needs Python 3.10 or newer.",
		install:
			"Install the phaseo package with the project's package manager (uv, poetry or pip).",
		localDocs: "SKILL.md inside the installed phaseo package",
		skill: "phaseo-sdk-python",
	},
	curl: {
		projectLabel: "",
		requirement: "",
		install:
			"Do not add an SDK. Call the HTTP API with the HTTP client the project already uses.",
		localDocs: null,
		skill: "phaseo-gateway",
	},
	go: {
		projectLabel: "Go",
		requirement: "It needs Go 1.23 or newer.",
		install: "Run `go get github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v3@latest`.",
		localDocs: null,
		skill: "phaseo-gateway",
	},
	csharp: {
		projectLabel: ".NET",
		requirement: "It needs .NET 8 or newer.",
		install: "Run `dotnet add package Phaseo.Sdk`.",
		localDocs: null,
		skill: "phaseo-gateway",
	},
	java: {
		projectLabel: "Java",
		requirement: "It needs Java 17 or newer.",
		install: `Add app.phaseo:phaseo-sdk by following the Java section of ${CLIENT_SDK_DOCS}. The 3.0.0 artifact on Maven Central is older than the documented API.`,
		localDocs: null,
		skill: "phaseo-gateway",
	},
	php: {
		projectLabel: "PHP",
		requirement: "It needs PHP 8.1 or newer.",
		install: "Run `composer require phaseo/sdk`.",
		localDocs: null,
		skill: "phaseo-gateway",
	},
	ruby: {
		projectLabel: "Ruby",
		requirement: "It needs Ruby 3.0 or newer.",
		install: "Add gem \"phaseo_sdk\" to the Gemfile and run bundle install.",
		localDocs: null,
		skill: "phaseo-gateway",
	},
};

export const AGENT_PROMPT_FAMILY_IDS = Object.keys(FAMILY_SETUP) as AgentPromptFamilyId[];

export function isAgentPromptFamily(value: string): value is AgentPromptFamilyId {
	return value in FAMILY_SETUP;
}

export function buildAgentSetupPrompt(family: AgentPromptFamilyId): string {
	const setup = FAMILY_SETUP[family];
	const intro =
		family === "curl"
			? "Set up Phaseo in this project over plain HTTP."
			: `Set up Phaseo in this ${setup.projectLabel} project. ${setup.requirement}`;
	const docsToRead = setup.localDocs
		? `read ${setup.localDocs}`
		: `read ${DOCS}/skill.md`;
	const installStep =
		family === "curl"
			? setup.install
			: `${setup.install} If a release-age policy blocks the install, stop and ask me instead of changing it.`;

	return [
		intro,
		"",
		`1. ${installStep}`,
		`2. Add a note to AGENTS.md, creating it if needed: before using Phaseo, follow the ${setup.skill} skill if it's installed, and ${docsToRead}. Call ${API_BASE} and check model IDs with GET ${API_BASE}/models instead of guessing them.`,
		`3. Read the API key from the PHASEO_API_KEY environment variable in server-side code only. Add PHASEO_API_KEY to the example env file without a value. Never print, commit or ship the key to a browser. If it is not set, ask me to create one at ${KEYS_URL}.`,
		`4. If you support skills, run \`npx skills@latest add ${DOCS} --skill ${setup.skill}\`.`,
	].join("\n");
}

export interface AgentTaskPromptOptions {
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

export function buildAgentTaskPrompt({ modelId, endpointPath }: AgentTaskPromptOptions): string {
	const path = endpointPath ?? "/responses";
	const task = (TASK_BY_PATH[path] ?? "calls {model} and returns the result").replace(
		"{model}",
		modelId,
	);
	return `Add a server-side function that ${task}. Use Phaseo's POST /v1${path} endpoint with the client from the setup. Follow the project's existing structure, handle Phaseo error codes, and add a test that mocks the HTTP call.`;
}
