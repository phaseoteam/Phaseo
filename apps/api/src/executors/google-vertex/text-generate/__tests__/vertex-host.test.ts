import { describe, expect, it } from "vitest";
import { isGoogleVertexHost } from "../index";

describe("isGoogleVertexHost", () => {
	it.each([
		"https://aiplatform.googleapis.com/v1",
		"https://us-east5-aiplatform.googleapis.com/v1",
		"https://aiplatform.eu.rep.googleapis.com/v1",
	])("accepts the Vertex host %s", (base) => {
		expect(isGoogleVertexHost(base)).toBe(true);
	});

	it.each([
		"https://evilaiplatform.googleapis.com/v1",
		"https://aiplatform.googleapis.com.evil.example/v1",
		"https://evil.example/aiplatform.googleapis.com",
		"not a url",
	])("rejects %s", (base) => {
		expect(isGoogleVertexHost(base)).toBe(false);
	});
});
