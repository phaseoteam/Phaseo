import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preferredSessionBackend, writeSession } from "../src/session.ts";

test("prefers OS-backed storage on supported platforms", () => {
	assert.equal(preferredSessionBackend({} as NodeJS.ProcessEnv, "win32"), "dpapi-file");
	assert.equal(preferredSessionBackend({} as NodeJS.ProcessEnv, "darwin"), "keychain");
	assert.equal(preferredSessionBackend({} as NodeJS.ProcessEnv, "linux"), "secret-service");
});

test("allows overriding the session backend", () => {
	assert.equal(
		preferredSessionBackend({ PHASEO_SESSION_BACKEND: "file" } as NodeJS.ProcessEnv, "win32"),
		"file",
	);
	assert.equal(
		preferredSessionBackend({ PHASEO_SESSION_BACKEND: "os" } as NodeJS.ProcessEnv, "linux"),
		"secret-service",
	);
});

test("does not select plaintext storage unless explicitly requested", () => {
	assert.equal(preferredSessionBackend({} as NodeJS.ProcessEnv, "freebsd"), "unavailable");
	assert.equal(
		preferredSessionBackend({ PHASEO_SESSION_BACKEND: "file" } as NodeJS.ProcessEnv, "freebsd"),
		"file",
	);
});

test("fails closed when the selected OS credential store cannot write", async () => {
	const directory = await mkdtemp(join(tmpdir(), "phaseo-cli-session-"));
	const blockedConfigPath = join(directory, "not-a-directory");
	const previousConfigDir = process.env.PHASEO_CONFIG_DIR;
	const previousBackend = process.env.PHASEO_SESSION_BACKEND;
	try {
		await writeFile(blockedConfigPath, "blocked");
		process.env.PHASEO_CONFIG_DIR = blockedConfigPath;
		delete process.env.PHASEO_SESSION_BACKEND;
		await assert.rejects(
			writeSession({
				accessToken: "access",
				refreshToken: "refresh",
				expiresAt: Date.now() + 60_000,
				apiUrl: "https://api.phaseo.app",
			}),
			/Unable to store the Phaseo session in the OS credential store/,
		);
	} finally {
		if (previousConfigDir === undefined) delete process.env.PHASEO_CONFIG_DIR;
		else process.env.PHASEO_CONFIG_DIR = previousConfigDir;
		if (previousBackend === undefined) delete process.env.PHASEO_SESSION_BACKEND;
		else process.env.PHASEO_SESSION_BACKEND = previousBackend;
		await rm(directory, { recursive: true, force: true });
	}
});
