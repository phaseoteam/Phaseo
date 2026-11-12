import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearSession, credentialHelperPath, preferredSessionBackend, readSession, runCommand, writeSession } from "../src/session.ts";

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
	assert.equal(
		preferredSessionBackend({ PHASEO_SESSION_BACKEND: "os" } as NodeJS.ProcessEnv, "freebsd"),
		"unavailable",
	);
});

test("does not select plaintext storage unless explicitly requested", () => {
	assert.equal(preferredSessionBackend({} as NodeJS.ProcessEnv, "freebsd"), "unavailable");
	assert.equal(
		preferredSessionBackend({ PHASEO_SESSION_BACKEND: "file" } as NodeJS.ProcessEnv, "freebsd"),
		"file",
	);
});

test("uses absolute paths for OS credential helpers", async () => {
	const directory = await mkdtemp(join(tmpdir(), "phaseo-cli-helper-"));
	const helper = join(directory, "secret-tool");
	await writeFile(helper, "#!/bin/sh\n");
	await chmod(helper, 0o700);
	assert.equal(credentialHelperPath("keychain"), "/usr/bin/security");
	assert.equal(credentialHelperPath("secret-service", { PATH: directory } as NodeJS.ProcessEnv), helper);
	assert.equal(
		credentialHelperPath("dpapi-file", { SystemRoot: "C:\\Windows" } as NodeJS.ProcessEnv),
		"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
	);
	await rm(directory, { recursive: true, force: true });
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

test("rejects malformed plaintext session records", async () => {
	const directory = await mkdtemp(join(tmpdir(), "phaseo-cli-malformed-session-"));
	const previousConfigDir = process.env.PHASEO_CONFIG_DIR;
	const previousBackend = process.env.PHASEO_SESSION_BACKEND;
	try {
		process.env.PHASEO_CONFIG_DIR = directory;
		process.env.PHASEO_SESSION_BACKEND = "file";
		await writeFile(join(directory, "session.json"), JSON.stringify({
			accessToken: "access",
			refreshToken: 123,
			expiresAt: "tomorrow",
			apiUrl: "https://api.phaseo.app",
		}));
		assert.equal(await readSession(), null);
	} finally {
		if (previousConfigDir === undefined) delete process.env.PHASEO_CONFIG_DIR;
		else process.env.PHASEO_CONFIG_DIR = previousConfigDir;
		if (previousBackend === undefined) delete process.env.PHASEO_SESSION_BACKEND;
		else process.env.PHASEO_SESSION_BACKEND = previousBackend;
		await rm(directory, { recursive: true, force: true });
	}
});

test("round-trips a Windows session through DPAPI", { skip: process.platform !== "win32" }, async () => {
	const directory = await mkdtemp(join(tmpdir(), "phaseo-cli-dpapi-"));
	const previousConfigDir = process.env.PHASEO_CONFIG_DIR;
	const previousBackend = process.env.PHASEO_SESSION_BACKEND;
	const session = {
		accessToken: "access-token-for-dpapi-test",
		refreshToken: "refresh-token-for-dpapi-test",
		expiresAt: Date.now() + 60_000,
		apiUrl: "https://api.phaseo.app",
	};
	try {
		process.env.PHASEO_CONFIG_DIR = directory;
		delete process.env.PHASEO_SESSION_BACKEND;
		await writeSession(session);
		assert.deepEqual(await readSession(), session);
		await clearSession();
		assert.equal(await readSession(), null);
	} finally {
		if (previousConfigDir === undefined) delete process.env.PHASEO_CONFIG_DIR;
		else process.env.PHASEO_CONFIG_DIR = previousConfigDir;
		if (previousBackend === undefined) delete process.env.PHASEO_SESSION_BACKEND;
		else process.env.PHASEO_SESSION_BACKEND = previousBackend;
		await rm(directory, { recursive: true, force: true });
	}
});

test("credential helpers that exit before reading stdin fail cleanly instead of crashing", async () => {
	// Several megabytes guarantees the write outlives the child, so stdin raises EPIPE.
	await assert.rejects(
		runCommand(process.execPath, ["-e", "process.exit(3)"], "x".repeat(8 * 1024 * 1024)),
		/exited with code 3/,
	);
});
