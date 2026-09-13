import { describe, expect, it } from "vitest";
import {
	buildPrivateModelId,
	normalizePositiveInteger,
	normalizePrivateModelBaseUrl,
	normalizePrivateModelId,
	normalizePrivateModelSecret,
} from "./private-models";

describe("private model validation", () => {
	it("builds the public model ID from the trusted workspace namespace", () => {
		expect(buildPrivateModelId("00000000-0000-4000-8000-000000000010", "Legal-Assistant")).toBe("00000000-0000-4000-8000-000000000010/legal-assistant");
		expect(() => buildPrivateModelId("workspace", "other/model")).toThrow(/slug/);
	});
	it("normalizes ordinary owner/model slugs", () => {
		expect(normalizePrivateModelId("Acme/Legal-Assistant")).toBe("acme/legal-assistant");
		expect(normalizePrivateModelId("acme/legal_assistant.v2:latest")).toBe("acme/legal_assistant.v2:latest");
	});

	it.each(["legal-assistant", "acme/", "/model", "acme/a/b", "../openai/gpt-4o"])("rejects invalid model id %s", (value) => {
		expect(() => normalizePrivateModelId(value)).toThrow(/model_id/);
	});

	it("accepts public HTTPS base paths and removes trailing slashes", () => {
		expect(normalizePrivateModelBaseUrl("https://models.example.com/openai/v1/")).toBe("https://models.example.com/openai/v1");
	});

	it.each([
		"http://models.example.com/v1",
		"https://localhost/v1",
		"https://127.0.0.1/v1",
		"https://metadata.google.internal/v1",
		"https://models.example.com:8443/v1",
		"https://models.example.com/v1?token=secret",
		"https://user:secret@models.example.com/v1",
		"https://models.example.com/v1/chat/completions",
	])("rejects unsafe endpoint %s", (value) => {
		expect(() => normalizePrivateModelBaseUrl(value)).toThrow(/base_url/);
	});

	it("validates credentials and optional limits", () => {
		expect(normalizePrivateModelSecret("private-token-123")).toBe("private-token-123");
		expect(() => normalizePrivateModelSecret("too short")).toThrow(/credential/);
		expect(normalizePositiveInteger("8192", "context_length")).toBe(8192);
		expect(normalizePositiveInteger(null, "context_length")).toBeNull();
		expect(() => normalizePositiveInteger(0, "context_length")).toThrow(/context_length/);
	});
});
