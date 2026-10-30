import {
	API_KEY_LIMIT_PRESETS,
	buildAppConfigSnippets,
	buildCollectionExports,
	buildEnvFile,
	getApiKeyPreset,
} from "./secretReveal";

describe("secret reveal helpers", () => {
	it("builds .env content with the selected env var and base URL", () => {
		expect(
			buildEnvFile({
				apiKey: "phaseo_v1_sk_kid_secret",
				envVarName: "PHASEO_MANAGEMENT_KEY",
				baseUrl: "https://api.phaseo.app/v1/",
			}),
		).toBe(
			'PHASEO_MANAGEMENT_KEY="phaseo_v1_sk_kid_secret"\nPHASEO_BASE_URL="https://api.phaseo.app/v1"\n',
		);
	});

	it("keeps downloaded collection exports free of the real secret", () => {
		const exports = buildCollectionExports();
		expect(exports.length).toBeGreaterThanOrEqual(3);
		for (const item of exports) {
			expect(item.content).toContain("paste-your-phaseo-key");
			expect(item.content).not.toContain("phaseo_v1_sk_real");
		}
	});

	it("includes ready app config snippets for common clients", () => {
		const snippets = buildAppConfigSnippets({
			apiKey: "phaseo_v1_sk_real",
		});
		expect(snippets.map((snippet) => snippet.id)).toEqual(
			expect.arrayContaining([
				"openai-node",
				"openai-python",
				"vercel-ai-sdk",
				"codex",
				"claude-code",
				"opencode",
			]),
		);
	});

	it("defines selectable API key presets with non-negative limits", () => {
		expect(getApiKeyPreset("production").limits.dailyRequests).toBe(0);
		for (const preset of API_KEY_LIMIT_PRESETS) {
			for (const value of Object.values(preset.limits)) {
				expect(value).toBeGreaterThanOrEqual(0);
			}
		}
	});
});
