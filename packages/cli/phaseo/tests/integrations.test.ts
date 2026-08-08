import assert from "node:assert/strict";
import test from "node:test";
import { renderCodexProfile } from "../src/integrations/adapters/codex.js";
import { renderClaudeSettings } from "../src/integrations/adapters/claude-code.js";

test("Codex profile uses the Responses API without embedding a credential", () => {
	const profile = renderCodexProfile("anthropic/claude-sonnet-4.6");
	assert.match(profile, /wire_api = "responses"/);
	assert.match(profile, /env_key = "PHASEO_API_KEY"/);
	assert.match(profile, /model = "anthropic\/claude-sonnet-4.6"/);
	assert.doesNotMatch(profile, /phaseo_v1_sk_/);
});

test("Claude Code settings preserve unrelated values", () => {
	const rendered = renderClaudeSettings("/tmp/settings.json", JSON.stringify({
		permissions: { allow: ["Read"] },
		env: { KEEP_ME: "yes" },
	}));
	const settings = JSON.parse(rendered);
	assert.deepEqual(settings.permissions, { allow: ["Read"] });
	assert.equal(settings.env.KEEP_ME, "yes");
	assert.equal(settings.env.ANTHROPIC_BASE_URL, "https://api.phaseo.app");
	assert.equal(settings.env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY, "1");
	assert.equal(settings.apiKeyHelper, "phaseo integrations credential");
});

test("Claude Code rejects malformed configuration", () => {
	assert.throws(() => renderClaudeSettings("/tmp/settings.json", "{broken"), /Cannot update malformed/);
});
