/** Names that usually hold credentials, as Codex filters them, matched anywhere in the name and in any case. */
const SECRET_NAME = /KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|_AUTH|PRIVATE/i;
/** Electron's and the app's own variables: they change how child Electron apps start or describe this app's internals. */
const INTERNAL_NAME = /^(ELECTRON_|PHASEO_|CHROME_CRASHPAD_)/i;
/** Matches above that are paths or switches, not secrets, and that tools need. */
const KEPT = new Set(["SSH_AUTH_SOCK", "PHASEO_GATEWAY_ENDPOINT"]);
/** Commands run without a terminal: Git and pagers must never wait for an editor, a prompt or a keypress. */
const NON_INTERACTIVE = { GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true", GIT_PAGER: "cat", PAGER: "cat", GCM_INTERACTIVE: "never" };

export const isScrubbedVariable = (name: string) => !KEPT.has(name.toUpperCase()) && (SECRET_NAME.test(name) || INTERNAL_NAME.test(name));

/** The environment for agent commands: the app's own without credentials and internals, plus non-interactive Git. */
export function commandEnvironment(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	const environment: NodeJS.ProcessEnv = {};
	// Windows names ignore case, so a differently cased copy of an override is dropped rather than left to compete with it.
	for (const [name, value] of Object.entries(base)) if (value !== undefined && !isScrubbedVariable(name) && !(name.toUpperCase() in NON_INTERACTIVE)) environment[name] = value;
	return { ...environment, ...NON_INTERACTIVE };
}
