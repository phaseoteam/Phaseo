import test from "node:test";
import assert from "node:assert/strict";
import { preferredSessionBackend } from "../src/session.ts";

test("prefers OS-backed storage on supported platforms", () => {
	assert.equal(preferredSessionBackend({} as NodeJS.ProcessEnv, "win32"), "dpapi-file");
	assert.equal(preferredSessionBackend({} as NodeJS.ProcessEnv, "darwin"), "keychain");
	assert.equal(preferredSessionBackend({} as NodeJS.ProcessEnv, "linux"), "secret-service");
});

test("allows overriding the session backend", () => {
	assert.equal(
		preferredSessionBackend({ AI_STATS_SESSION_BACKEND: "file" } as NodeJS.ProcessEnv, "win32"),
		"file",
	);
	assert.equal(
		preferredSessionBackend({ AI_STATS_SESSION_BACKEND: "os" } as NodeJS.ProcessEnv, "linux"),
		"secret-service",
	);
});
