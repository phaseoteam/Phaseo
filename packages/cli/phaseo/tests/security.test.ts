import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertApiRootAllowed, isCustomApiRoot, isTrustedBrowserUrl, normalizeApiRoot } from "../src/api.ts";
import { renderList, renderWhoami } from "../src/index.ts";
import { createKeychainSessionStore, decryptSessionPayload, encryptSessionPayload, keychainAddCommand, type SecurityCommand } from "../src/session.ts";

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

/** In-memory stand-in for /usr/bin/security that honours the 4096-byte interactive input cap. */
function fakeSecurity(options: { ignoreAdds?: boolean } = {}) {
	const items = new Map<string, string>();
	const calls: Array<{ args: string[]; input?: string }> = [];
	const command: SecurityCommand = async (args, input) => {
		calls.push({ args, input });
		if (args[0] === "-i") {
			if ((input ?? "").length > 4096) throw new Error("security: input line too long");
			const match = /^add-generic-password -U -a (\S+) -s (\S+) -X ([0-9a-f]+)\n$/.exec(input ?? "");
			if (match && !options.ignoreAdds) items.set(`${match[1]}/${match[2]}`, Buffer.from(match[3]!, "hex").toString("utf8"));
			return "";
		}
		const account = args[args.indexOf("-a") + 1];
		const service = args[args.indexOf("-s") + 1];
		const id = `${account}/${service}`;
		if (args[0] === "find-generic-password") {
			const value = items.get(id);
			if (value === undefined) throw new Error("The specified item could not be found in the keychain.");
			return `${value}\n`;
		}
		if (args[0] === "delete-generic-password") {
			if (!items.delete(id)) throw new Error("The specified item could not be found in the keychain.");
			return "";
		}
		throw new Error(`unexpected security command ${args.join(" ")}`);
	};
	return { items, calls, command };
}

async function withConfigDir(run: (directory: string) => Promise<void>) {
	const directory = await mkdtemp(join(tmpdir(), "phaseo-keychain-"));
	const previous = process.env.PHASEO_CONFIG_DIR;
	process.env.PHASEO_CONFIG_DIR = directory;
	try {
		await run(directory);
	} finally {
		if (previous === undefined) delete process.env.PHASEO_CONFIG_DIR;
		else process.env.PHASEO_CONFIG_DIR = previous;
		await rm(directory, { recursive: true, force: true });
	}
}

function largeSession() {
	const integrationGatewayCredentials: Record<string, { key: string; keyId: string; expiresAt: number }> = {};
	for (const name of ["codex", "claude-code", "opencode", "hermes", "aider", "continue", "pi", "openclaw"]) {
		integrationGatewayCredentials[name] = { key: `phaseo_v1_sk_${"s".repeat(400)}`, keyId: `key_${name}_${"0".repeat(30)}`, expiresAt: Date.now() + 1000 };
	}
	return { accessToken: `secret-access-${"a".repeat(800)}`, refreshToken: "secret-refresh", expiresAt: Date.now() + 3_600_000, apiUrl: "https://api.phaseo.app", integrationGatewayCredentials };
}

test("macOS keychain stores only a data key; any session size is kept in an AES-GCM file", async () => {
	await withConfigDir(async (directory) => {
		const security = fakeSecurity();
		const store = createKeychainSessionStore(security.command);
		const session = largeSession();
		assert.ok(JSON.stringify(session).length > 4096, "session is larger than the interactive input cap");
		await store.write(session);
		assert.deepEqual(await store.read(), session);
		await store.write({ ...session, accessToken: "secret-access-rotated" });
		assert.equal((await store.read())?.accessToken, "secret-access-rotated");

		for (const call of security.calls) {
			assert.doesNotMatch(call.args.join(" "), /secret|phaseo_v1_sk/, "no secret in argv");
			assert.ok((call.input ?? "").length < 4096);
		}
		assert.deepEqual([...security.items.keys()], ["default/phaseo-cli-session-key"]);
		assert.match(security.items.get("default/phaseo-cli-session-key")!, /^[0-9a-f]{64}$/);

		const file = join(directory, "session.keychain.enc");
		const payload = await readFile(file, "utf8");
		assert.doesNotMatch(payload, /secret|phaseo_v1_sk/);
		if (process.platform !== "win32") assert.equal((await stat(file)).mode & 0o777, 0o600);
		assert.deepEqual(await readdir(directory), ["session.keychain.enc"], "atomic write leaves no temp files");

		const key = Buffer.from(security.items.get("default/phaseo-cli-session-key")!, "hex");
		assert.equal(decryptSessionPayload(payload, Buffer.alloc(32, 1)), null, "wrong key fails authentication");
		const tampered = JSON.parse(payload);
		tampered.data = Buffer.from("x").toString("base64");
		assert.equal(decryptSessionPayload(JSON.stringify(tampered), key), null, "tampered data fails authentication");
		assert.deepEqual(decryptSessionPayload(encryptSessionPayload(session, key), key), session);

		await store.clear();
		assert.equal(security.items.size, 0);
		assert.equal(await store.read(), null);
	});
});

test("macOS keychain migrates a whole-session item from older versions on first read", async () => {
	await withConfigDir(async () => {
		const security = fakeSecurity();
		const session = { accessToken: "secret-access", refreshToken: "secret-refresh", expiresAt: Date.now() + 1000, apiUrl: "https://api.phaseo.app" };
		security.items.set("default/phaseo-cli-session", JSON.stringify(session));
		const store = createKeychainSessionStore(security.command);
		assert.deepEqual(await store.read(), session);
		assert.equal(security.items.has("default/phaseo-cli-session"), false, "legacy item removed after migration");
		assert.ok(security.items.has("default/phaseo-cli-session-key"));
		assert.deepEqual(await store.read(), session);
	});
});

test("macOS keychain write fails closed when the data key cannot be stored", async () => {
	await withConfigDir(async (directory) => {
		const security = fakeSecurity({ ignoreAdds: true });
		const store = createKeychainSessionStore(security.command);
		await assert.rejects(store.write(largeSession()), /did not store the session key/);
		assert.ok(security.calls.every((call) => !/secret/.test(call.args.join(" "))), "no argv fallback");
		assert.deepEqual(await readdir(directory), []);
	});
	assert.deepEqual(keychainAddCommand("svc", "abc"), { args: ["-i"], input: "add-generic-password -U -a default -s svc -X 616263\n" });
});

test("list and whoami renderers strip terminal control sequences from server text", () => {
	const hostile = "evil\u001b]52;c;cGF5bG9hZA==\u0007\u001b[2Jname";
	const rendered = renderList([{ name: hostile, id: "key_1" }], (key) => `${key.name} ${key.id}`);
	assert.doesNotMatch(rendered, /[\u001b\u0007]/);
	assert.match(rendered, /evil .*name key_1\n$/);
	const whoami = renderWhoami({ data: { user: { email: hostile }, current_workspace_id: "ws", workspaces: [{ name: hostile, role: "owner", id: "ws" }] } }, "https://api.phaseo.app");
	assert.doesNotMatch(whoami, /[\u001b\u0007]/);
});
