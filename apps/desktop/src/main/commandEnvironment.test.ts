import { describe, expect, it } from "vitest";
import { commandEnvironment, isScrubbedVariable } from "./commandEnvironment";

describe("commandEnvironment", () => {
	it("drops credentials and app internals but keeps what tools need", () => {
		const base = {
			OPENAI_API_KEY: "x", github_token: "x", AWS_SECRET_ACCESS_KEY: "x", DB_PASSWORD: "x", PGPASSWD: "x", GOOGLE_APPLICATION_CREDENTIALS: "x",
			NPM_CONFIG__AUTH: "x", MY_PRIVATE_THING: "x", Stripe_Secret: "x", ELECTRON_RUN_AS_NODE: "1", PHASEO_ORCHESTRATOR_URL: "x", PHASEO_OWNED_CLAUDE_ROOT: "x", CHROME_CRASHPAD_PIPE_NAME: "x",
			PATH: "/bin", Path: "C:\\Windows", HOME: "/home/me", USERPROFILE: "C:\\Users\\me", SystemRoot: "C:\\Windows", TEMP: "C:\\Temp", TMP: "/tmp", LANG: "en_GB.UTF-8",
			SSH_AUTH_SOCK: "/tmp/agent", PHASEO_GATEWAY_ENDPOINT: "https://example.test", AUTHOR: "me", UNDEFINED: undefined,
		};
		const environment = commandEnvironment(base);
		for (const name of ["OPENAI_API_KEY", "github_token", "AWS_SECRET_ACCESS_KEY", "DB_PASSWORD", "PGPASSWD", "GOOGLE_APPLICATION_CREDENTIALS", "NPM_CONFIG__AUTH", "MY_PRIVATE_THING", "Stripe_Secret", "ELECTRON_RUN_AS_NODE", "PHASEO_ORCHESTRATOR_URL", "PHASEO_OWNED_CLAUDE_ROOT", "CHROME_CRASHPAD_PIPE_NAME", "UNDEFINED"]) expect(environment).not.toHaveProperty(name);
		expect(environment).toMatchObject({ PATH: "/bin", Path: "C:\\Windows", HOME: "/home/me", USERPROFILE: "C:\\Users\\me", SystemRoot: "C:\\Windows", TEMP: "C:\\Temp", TMP: "/tmp", LANG: "en_GB.UTF-8", SSH_AUTH_SOCK: "/tmp/agent", PHASEO_GATEWAY_ENDPOINT: "https://example.test", AUTHOR: "me" });
		expect(base).toHaveProperty("OPENAI_API_KEY");
	});

	it("makes Git and pagers non-interactive, replacing differently cased values", () => {
		const environment = commandEnvironment({ git_editor: "code --wait", GIT_TERMINAL_PROMPT: "1", PATH: "/bin" });
		expect(environment).toMatchObject({ GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true", GIT_PAGER: "cat", PAGER: "cat", GCM_INTERACTIVE: "never" });
		expect(environment).not.toHaveProperty("git_editor");
	});

	it("matches names in any case", () => {
		expect(isScrubbedVariable("my_token_file")).toBe(true);
		expect(isScrubbedVariable("Phaseo_Owned_Native_Key")).toBe(true);
		expect(isScrubbedVariable("ssh_auth_sock")).toBe(false);
		expect(isScrubbedVariable("NODE_OPTIONS")).toBe(false);
	});
});
