import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardContext } from "./guards";
import { fetchGatewayContext } from "./context";

vi.mock("./context", () => ({
	fetchGatewayContext: vi.fn(),
}));

const fetchGatewayContextMock = vi.mocked(fetchGatewayContext);

function guard(model: string) {
	return guardContext({
		workspaceId: "team_123",
		apiKeyId: "key_123",
		endpoint: "chat.completions",
		capability: "text.generate",
		model,
		requestId: "req_preset_1",
	});
}

describe("guardContext for preset references", () => {
	beforeEach(() => {
		fetchGatewayContextMock.mockReset();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("returns 404 naming the preset when it does not exist or the key cannot use it", async () => {
		fetchGatewayContextMock.mockRejectedValue(new Error("preset_not_found"));
		const result = await guard("@support-triag");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(404);
		const body = await result.response.json();
		expect(body).toMatchObject({ reason: "preset_not_found", error: { code: "not_found" } });
		expect(body.error.message).toBe('Preset "@support-triag" was not found, or this key cannot use it');
	});

	it("returns 404 naming the version when a pinned version or label does not exist", async () => {
		fetchGatewayContextMock.mockRejectedValue(new Error('gateway_context_rpc_error:preset_version_not_found'));
		const result = await guard("@support-triage@staging");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(404);
		const body = await result.response.json();
		expect(body).toMatchObject({ reason: "preset_version_not_found", error: { code: "not_found" } });
		expect(body.error.message).toBe('Preset "@support-triage" has no published version or label "staging", or this key cannot use it');
	});

	it("still names the preset when a pinned reference's preset is missing", async () => {
		fetchGatewayContextMock.mockRejectedValue(new Error("preset_not_found"));
		const result = await guard("@acme/support-triag@v2");
		expect(result.ok === false && result.response.status).toBe(404);
		if (result.ok) return;
		expect((await result.response.json()).reason).toBe("preset_not_found");
	});

	it("returns 400 when the preset has no model", async () => {
		fetchGatewayContextMock.mockRejectedValue(new Error('preset_no_model: Preset "x" has no model configured'));
		const result = await guard("@empty");
		expect(result.ok === false && result.response.status).toBe(400);
	});

	it("keeps other context failures as gateway errors", async () => {
		fetchGatewayContextMock.mockRejectedValue(new Error("preset_not_found"));
		const plain = await guard("openai/gpt-4.1-mini");
		expect(plain.ok === false && plain.response.status).toBe(500);
		fetchGatewayContextMock.mockRejectedValue(new Error("connection reset"));
		const preset = await guard("@support-triage");
		expect(preset.ok === false && preset.response.status).toBe(500);
	});
});
