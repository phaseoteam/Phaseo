import assert from "node:assert/strict";
import test from "node:test";
import { assertApiRootAllowed, isCustomApiRoot, isTrustedBrowserUrl, normalizeApiRoot } from "../src/api.ts";
import { renderList, renderWhoami } from "../src/index.ts";
import { keychainWriteCommand } from "../src/session.ts";

test("login refuses a custom API root unless explicitly allowed", () => {
	assert.equal(assertApiRootAllowed(normalizeApiRoot("https://api.phaseo.app/v1"), { env: {} }), null);
	assert.equal(assertApiRootAllowed(normalizeApiRoot("http://127.0.0.1:8788"), { env: {} }), null);
	assert.equal(assertApiRootAllowed(normalizeApiRoot("http://localhost:8788"), { env: {} }), null);
	assert.throws(
		() => assertApiRootAllowed(normalizeApiRoot("https://api.example.com"), { env: {} }),
		/Refusing to sign in to api\.example\.com.*--allow-custom-api-url/,
	);
	assert.equal(assertApiRootAllowed("https://api.example.com", { allowCustom: true, env: {} }), "api.example.com");
	assert.equal(assertApiRootAllowed("https://api.example.com:8443", { env: { PHASEO_ALLOW_CUSTOM_API_URL: "1" } }), "api.example.com:8443");
	assert.throws(() => assertApiRootAllowed("https://api.example.com", { env: { PHASEO_ALLOW_CUSTOM_API_URL: "true" } }), /Refusing/);
	assert.equal(isCustomApiRoot("https://api.phaseo.app"), false);
	assert.equal(isCustomApiRoot("https://phaseo.app.example.com"), true);
});

test("whoami shows the API host only when it is not the default", () => {
	const body = { data: { user: { email: "a@example.com" }, current_workspace_id: "ws_1", workspaces: [] } };
	assert.doesNotMatch(renderWhoami(body, "https://api.phaseo.app"), /API host/);
	assert.match(renderWhoami(body, "https://api.example.com"), /API host: api\.example\.com \(not the default Phaseo API\)/);
});

test("only HTTPS phaseo.app links from the server are opened in a browser", () => {
	assert.equal(isTrustedBrowserUrl("https://phaseo.app/settings/credits/topups/abc?token=x"), true);
	assert.equal(isTrustedBrowserUrl("https://checkout.phaseo.app/pay"), true);
	assert.equal(isTrustedBrowserUrl("http://phaseo.app/settings"), false);
	assert.equal(isTrustedBrowserUrl("https://phaseo.app.example.com/"), false);
	assert.equal(isTrustedBrowserUrl("https://evilphaseo.app/"), false);
	assert.equal(isTrustedBrowserUrl("https://user@phaseo.app/"), false);
	assert.equal(isTrustedBrowserUrl("file:///etc/passwd"), false);
	assert.equal(isTrustedBrowserUrl("javascript:alert(1)"), false);
	assert.equal(isTrustedBrowserUrl(42), false);
});

test("macOS keychain writes pass the session on stdin, not in process arguments", () => {
	const session = { accessToken: "secret-access", refreshToken: "secret-refresh", expiresAt: 1, apiUrl: "https://api.phaseo.app" };
	const command = keychainWriteCommand(session);
	assert.deepEqual(command.args, ["-i"]);
	assert.doesNotMatch(command.args.join(" "), /secret/);
	const hex = /-X ([0-9a-f]+)\n$/.exec(command.input)?.[1];
	assert.ok(hex, "session is hex-encoded on stdin");
	assert.deepEqual(JSON.parse(Buffer.from(hex, "hex").toString("utf8")), session);
	assert.match(command.input, /^add-generic-password -U -a default -s phaseo-cli-session -X /);
});

test("list and whoami renderers strip terminal control sequences from server text", () => {
	const hostile = "evil\u001b]52;c;cGF5bG9hZA==\u0007\u001b[2Jname";
	const rendered = renderList([{ name: hostile, id: "key_1" }], (key) => `${key.name} ${key.id}`);
	assert.doesNotMatch(rendered, /[\u001b\u0007]/);
	assert.match(rendered, /evil .*name key_1\n$/);
	const whoami = renderWhoami({ data: { user: { email: hostile }, current_workspace_id: "ws", workspaces: [{ name: hostile, role: "owner", id: "ws" }] } }, "https://api.phaseo.app");
	assert.doesNotMatch(whoami, /[\u001b\u0007]/);
});
