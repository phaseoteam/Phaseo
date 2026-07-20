#!/usr/bin/env node

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

function parseArgs(argv) {
	const result = {};
	for (let index = 0; index < argv.length; index += 1) {
		const entry = argv[index];
		if (!entry.startsWith("--")) throw new Error(`Unexpected argument: ${entry}`);
		const key = entry.slice(2);
		if (key === "no-open") {
			result.noOpen = true;
			continue;
		}
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
		result[key] = value;
		index += 1;
	}
	return result;
}

function normalizeApiUrl(value) {
	const url = new URL(value);
	if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname))) {
		throw new Error("--api-url must use HTTPS, except for a loopback local test server");
	}
	return url.toString().replace(/\/$/, "");
}

function base64Url(bytes) {
	return Buffer.from(bytes).toString("base64url");
}

function safeEqual(left, right) {
	const leftBytes = Buffer.from(left);
	const rightBytes = Buffer.from(right);
	return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function openBrowser(url) {
	const platform = process.platform;
	const command = platform === "win32" ? "rundll32.exe" : platform === "darwin" ? "open" : "xdg-open";
	const args = platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
	const child = spawn(command, args, { detached: true, stdio: "ignore", shell: false });
	child.unref();
}

function waitForAuthorizationCode({ port, expectedState, timeoutMs }) {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (callback) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			server.close(() => callback());
		};
		const server = createServer((request, response) => {
			const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
			if (url.pathname !== "/callback") {
				response.writeHead(404).end("Not found");
				return;
			}
			const state = url.searchParams.get("state") ?? "";
			const code = url.searchParams.get("code") ?? "";
			const error = url.searchParams.get("error") ?? "";
			if (!safeEqual(state, expectedState)) {
				response.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("OAuth state did not match.");
				finish(() => reject(new Error("OAuth callback state did not match")));
				return;
			}
			if (error || !code) {
				response.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("Phaseo authorization was not completed.");
				finish(() => reject(new Error(error || "OAuth callback did not include an authorization code")));
				return;
			}
			response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(
				"<!doctype html><html><body style=\"font-family:system-ui;padding:32px\"><h1>Phaseo OAuth test complete</h1><p>You can return to the terminal.</p></body></html>",
			);
			finish(() => resolve(code));
		});
		server.on("error", reject);
		server.listen(port, "127.0.0.1");
		const timeout = setTimeout(() => {
			finish(() => reject(new Error("OAuth authorization timed out")));
		}, timeoutMs);
	});
}

async function readJson(response, label) {
	const body = await response.json().catch(() => null);
	if (!response.ok) {
		const description = body?.error_description ?? body?.message ?? body?.error ?? `${response.status}`;
		throw new Error(`${label} failed: ${description}`);
	}
	return body;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const clientId = String(args["client-id"] ?? "").trim();
	if (!clientId) throw new Error("--client-id is required");
	const apiUrl = normalizeApiUrl(args["api-url"] ?? process.env.PHASEO_API_URL ?? "http://127.0.0.1:8790");
	const port = Number(args.port ?? 8977);
	if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("--port must be between 1024 and 65535");
	const scopes = String(args.scopes ?? "openid profile email gateway:access me:read").trim();
	const timeoutMs = Number(args["timeout-seconds"] ?? 600) * 1000;
	const redirectUri = `http://127.0.0.1:${port}/callback`;
	const codeVerifier = base64Url(randomBytes(32));
	const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
	const state = base64Url(randomBytes(32));

	const authorizeUrl = new URL(`${apiUrl}/oauth/authorize`);
	authorizeUrl.search = new URLSearchParams({
		response_type: "code",
		client_id: clientId,
		redirect_uri: redirectUri,
		scope: scopes,
		state,
		code_challenge: codeChallenge,
		code_challenge_method: "S256",
	}).toString();

	const codePromise = waitForAuthorizationCode({ port, expectedState: state, timeoutMs });
	if (args.noOpen) {
		process.stdout.write(`${authorizeUrl.toString()}\n`);
	} else {
		openBrowser(authorizeUrl.toString());
		process.stdout.write("Opened Phaseo authorization in your browser.\n");
	}
	const code = await codePromise;

	const tokenBody = new URLSearchParams({
		grant_type: "authorization_code",
		client_id: clientId,
		code,
		redirect_uri: redirectUri,
		code_verifier: codeVerifier,
	});
	const tokenHeaders = { "content-type": "application/x-www-form-urlencoded" };
	const clientSecret = process.env.PHASEO_OAUTH_CLIENT_SECRET?.trim();
	if (clientSecret) {
		tokenHeaders.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
	}
	const token = await readJson(await fetch(`${apiUrl}/oauth/token`, {
		method: "POST",
		headers: tokenHeaders,
		body: tokenBody,
	}), "Token exchange");
	if (typeof token?.access_token !== "string" || !token.access_token) throw new Error("Token exchange did not return an access token");

	const userinfo = await readJson(await fetch(`${apiUrl}/oauth/userinfo`, {
		headers: { authorization: `Bearer ${token.access_token}` },
	}), "Userinfo");

	const revokeBody = new URLSearchParams({ token: token.access_token, client_id: clientId });
	const revokeResponse = await fetch(`${apiUrl}/oauth/revoke`, {
		method: "POST",
		headers: tokenHeaders,
		body: revokeBody,
	});
	if (!revokeResponse.ok) throw new Error(`Token revocation failed: ${revokeResponse.status}`);
	const afterRevoke = await fetch(`${apiUrl}/oauth/userinfo`, {
		headers: { authorization: `Bearer ${token.access_token}` },
	});
	if (afterRevoke.status !== 401) throw new Error(`Revoked token remained usable: ${afterRevoke.status}`);

	process.stdout.write(`${JSON.stringify({
		ok: true,
		client_id: clientId,
		token_type: token.token_type ?? "Bearer",
		expires_in: token.expires_in ?? null,
		scope: token.scope ?? null,
		userinfo_subject_present: typeof userinfo?.sub === "string" && userinfo.sub.length > 0,
		revocation_verified: true,
	}, null, 2)}\n`);
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
