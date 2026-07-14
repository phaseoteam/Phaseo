import { beforeEach, describe, expect, it, vi } from "vitest";

const getBindingsMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: () => getBindingsMock(),
}));

import {
	buildVideoContentUrl,
	buildVideoPollingUrl,
	issueSignedVideoDownloadUrl,
	toPublicVideoProviderId,
	toPublicVideoStatus,
	verifySignedVideoDownloadRequest,
} from "./video-public";

describe("video-public helpers", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
		getBindingsMock.mockReturnValue({
	KEY_PEPPER_ACTIVE: "test-secret",
			GATEWAY_PUBLIC_BASE_URL: "https://api.phaseo.ai",
		});
	});

	it("maps internal provider ids into public ids", () => {
		expect(toPublicVideoProviderId("google-vertex")).toBe("google-vertex");
		expect(toPublicVideoProviderId("google-ai-studio")).toBe("google-ai-studio");
		expect(toPublicVideoProviderId("bytedance-seed")).toBe("byteplus");
		expect(toPublicVideoProviderId("xai")).toBe("x-ai");
	});

	it("normalizes video status values", () => {
		expect(toPublicVideoStatus("processing")).toBe("processing");
		expect(toPublicVideoStatus("queued")).toBe("queued");
		expect(toPublicVideoStatus("completed")).toBe("completed");
		expect(toPublicVideoStatus("cancelled")).toBe("cancelled");
		expect(toPublicVideoStatus("expired")).toBe("expired");
	});

	it("issues and verifies signed download URLs", async () => {
		const signed = await issueSignedVideoDownloadUrl({
			baseUrl: "https://api.phaseo.ai",
			workspaceId: "team_123",
			videoId: "G-abc",
			index: 1,
			disposition: "attachment",
			ttlSeconds: 900,
		});

		expect(signed?.download_url).toContain("/v1/videos/G-abc/content?index=1");
		expect(signed?.expires_at).toBeTypeOf("number");
		expect(buildVideoPollingUrl("https://api.phaseo.ai", "G-abc")).toBe("https://api.phaseo.ai/v1/videos/G-abc");
		expect(buildVideoContentUrl("https://api.phaseo.ai", "G-abc", 1)).toBe("https://api.phaseo.ai/v1/videos/G-abc/content?index=1");

		const verified = await verifySignedVideoDownloadRequest(String(signed?.download_url));
		expect(verified).toEqual({
			workspaceId: "team_123",
			videoId: "G-abc",
			index: 1,
			disposition: "attachment",
		});
	});
});
