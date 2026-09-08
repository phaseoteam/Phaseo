import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveVertexAccessToken, resolveVertexApiBase } from "./auth";

describe("google-vertex auth helpers", () => {
	afterEach(() => vi.unstubAllGlobals());

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
