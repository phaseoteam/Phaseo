import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearVertexAccessTokenCache, resolveVertexAccessToken, resolveVertexApiBase } from "./auth";

const serviceAccountPem = (generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey
	.export({ type: "pkcs8", format: "pem" }) as string);
const otherPem = (generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey
	.export({ type: "pkcs8", format: "pem" }) as string);

function serviceAccount(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		client_email: "svc@project.iam.gserviceaccount.com",
		private_key: serviceAccountPem,
		...overrides,
	});
}

function tokenEndpoint(...tokens: Array<{ access_token?: string; expires_in?: unknown } | number>) {
	let call = 0;
	return vi.fn(async () => {
		const next = tokens[Math.min(call++, tokens.length - 1)];
		if (typeof next === "number") return new Response("{}", { status: next });
		return Response.json(next);
	});
}

describe("google-vertex service-account token cache", () => {
	afterEach(() => {
		clearVertexAccessTokenCache();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("reuses a minted token until five minutes before expires_in, then refreshes", async () => {
		let now = 1_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const fetchMock = tokenEndpoint(
			{ access_token: "tok-1", expires_in: 3600 },
			{ access_token: "tok-2", expires_in: 3600 },
		);
		vi.stubGlobal("fetch", fetchMock);

		expect(await resolveVertexAccessToken(serviceAccount())).toBe("tok-1");
		now += 55 * 60_000 - 1;
		expect(await resolveVertexAccessToken(serviceAccount())).toBe("tok-1");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		now += 1;
		expect(await resolveVertexAccessToken(serviceAccount())).toBe("tok-2");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("dedupes concurrent mints for the same service account", async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		const fetchMock = vi.fn(async () => {
			await gate;
			return Response.json({ access_token: "shared", expires_in: 3600 });
		});
		vi.stubGlobal("fetch", fetchMock);
		const pending = Promise.all([1, 2, 3].map(() => resolveVertexAccessToken(serviceAccount())));
		await new Promise((resolve) => setTimeout(resolve, 20));
		release();
		expect(await pending).toEqual(["shared", "shared", "shared"]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("does not cache failures", async () => {
		const fetchMock = tokenEndpoint(500, { access_token: "after-failure", expires_in: 3600 });
		vi.stubGlobal("fetch", fetchMock);
		await expect(resolveVertexAccessToken(serviceAccount())).rejects.toMatchObject({ code: "google-vertex_oauth_error_500" });
		expect(await resolveVertexAccessToken(serviceAccount())).toBe("after-failure");
		expect(await resolveVertexAccessToken(serviceAccount())).toBe("after-failure");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("does not share a failed in-flight mint with concurrent waiters", async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		let call = 0;
		const fetchMock = vi.fn(async () => {
			call += 1;
			if (call === 1) {
				await gate;
				return new Response("{}", { status: 503 });
			}
			return Response.json({ access_token: "retry-ok", expires_in: 3600 });
		});
		vi.stubGlobal("fetch", fetchMock);
		const first = resolveVertexAccessToken(serviceAccount()).catch((error) => error);
		await new Promise((resolve) => setTimeout(resolve, 20));
		const waiter = resolveVertexAccessToken(serviceAccount());
		release();
		expect(await first).toMatchObject({ code: "google-vertex_oauth_error_503" });
		expect(await waiter).toBe("retry-ok");
	});

	it("does not cache tokens without a usable expires_in", async () => {
		const fetchMock = tokenEndpoint({ access_token: "a" }, { access_token: "b", expires_in: "nope" }, { access_token: "c", expires_in: 3600 });
		vi.stubGlobal("fetch", fetchMock);
		expect(await resolveVertexAccessToken(serviceAccount())).toBe("a");
		expect(await resolveVertexAccessToken(serviceAccount())).toBe("b");
		expect(await resolveVertexAccessToken(serviceAccount())).toBe("c");
		expect(await resolveVertexAccessToken(serviceAccount())).toBe("c");
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("keys the cache by the full credential, not just the client email", async () => {
		const fetchMock = tokenEndpoint(
			{ access_token: "first-key", expires_in: 3600 },
			{ access_token: "second-key", expires_in: 3600 },
			{ access_token: "other-email", expires_in: 3600 },
		);
		vi.stubGlobal("fetch", fetchMock);
		expect(await resolveVertexAccessToken(serviceAccount())).toBe("first-key");
		expect(await resolveVertexAccessToken(serviceAccount({ private_key: otherPem }))).toBe("second-key");
		expect(await resolveVertexAccessToken(serviceAccount({ client_email: "other@project.iam.gserviceaccount.com" }))).toBe("other-email");
		expect(await resolveVertexAccessToken(serviceAccount())).toBe("first-key");
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("records mints in the upstream auth phase and skips the fetch on a cache hit", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("global fetch must not be used"); }));
		const timedFetch = vi.fn(async () => Response.json({ access_token: "timed", expires_in: 3600 }));
		const upstreamTiming = { fetch: timedFetch, timingFor: () => undefined } as any;
		expect(await resolveVertexAccessToken(serviceAccount(), upstreamTiming)).toBe("timed");
		expect(timedFetch).toHaveBeenCalledWith("https://oauth2.googleapis.com/token", expect.objectContaining({ method: "POST" }), "auth");
		expect(await resolveVertexAccessToken(serviceAccount(), upstreamTiming)).toBe("timed");
		expect(timedFetch).toHaveBeenCalledTimes(1);
	});

	it("passes plain access tokens through without minting", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		expect(await resolveVertexAccessToken("Bearer ya29.plain")).toBe("ya29.plain");
		expect(await resolveVertexAccessToken(JSON.stringify({ access_token: "ya29.json" }))).toBe("ya29.json");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("google-vertex auth helpers", () => {
	afterEach(() => {
		clearVertexAccessTokenCache();
		vi.unstubAllGlobals();
	});

	it("rejects token redirects without sending credentials to the redirect target", async () => {
		const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
			status: 302,
			headers: { Location: "https://untrusted.example/token" },
		}));
		vi.stubGlobal("fetch", fetchMock);
		await expect(resolveVertexAccessToken(JSON.stringify({
			client_email: "test@example.iam.gserviceaccount.com",
			private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
		}))).rejects.toMatchObject({ code: "google-vertex_oauth_error_302" });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith("https://oauth2.googleapis.com/token",
			expect.objectContaining({ redirect: "manual" }));
	});
	it("throws coded error when project configuration is missing", () => {
		expect(() => resolveVertexApiBase({})).toThrowError("google-vertex_project_missing");
		try {
			resolveVertexApiBase({});
		} catch (error) {
			expect((error as any)?.code).toBe("google-vertex_project_missing");
		}
	});

	it("throws coded error when access token is missing", async () => {
		await expect(resolveVertexAccessToken("")).rejects.toMatchObject({
			message: "google-vertex_access_token_missing",
			code: "google-vertex_access_token_missing",
		});
	});

	it("uses the documented global Vertex endpoint by default", () => {
		const base = resolveVertexApiBase({ GOOGLE_VERTEX_PROJECT: "project-1" });
		expect(base).toBe(
			"https://aiplatform.googleapis.com/v1/projects/project-1/locations/global",
		);
	});
});
