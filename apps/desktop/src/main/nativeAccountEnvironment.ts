import type { Account } from "../shared/workspace";

/** Selected profiles must not inherit another account's token or billing route. */
export function nativeAccountEnvironment(account?: Account): NodeJS.ProcessEnv | undefined {
	if (!account?.configDirectory || account.kind !== "native") return undefined;
	if (account.harness === "codex") return { CODEX_HOME: account.configDirectory, OPENAI_API_KEY: undefined, CODEX_API_KEY: undefined };
	if (account.harness === "grok") return {
		...Object.fromEntries(Object.keys(process.env).filter(name => /^(GROK_|XAI_)/i.test(name)).map(name => [name, undefined])),
		GROK_HOME: account.configDirectory,
	};
	if (account.harness === "claude") return {
		CLAUDE_CONFIG_DIR: account.configDirectory, ANTHROPIC_API_KEY: undefined, ANTHROPIC_AUTH_TOKEN: undefined, ANTHROPIC_BASE_URL: undefined,
		CLAUDE_CODE_OAUTH_TOKEN: undefined, CLAUDE_CODE_USE_BEDROCK: undefined, CLAUDE_CODE_USE_VERTEX: undefined, CLAUDE_CODE_USE_FOUNDRY: undefined,
	};
	return undefined;
}
