import { resolveGatewayPath } from "./endpoint-paths";
import { buildEndpointRoutes, ENDPOINT_OPTIONS } from "./endpointRoutes";
import { buildExamplePayload, jsonToPythonLiteral } from "./quickstartPayloads";

describe("Parse quickstart", () => {
	test("uses the dedicated Parse route", () => {
		expect(resolveGatewayPath("parse")).toBe("/parse");
		expect(ENDPOINT_OPTIONS).toContainEqual({
			value: "parse",
			label: "Document Parse",
		});
		expect(
			buildEndpointRoutes([{ value: "parse", label: "Document Parse" }]),
		).toEqual([
			expect.objectContaining({
				value: "parse",
				method: "POST",
				path: "/v1/parse",
			}),
		]);
	});

	test("builds a valid document-image request", () => {
		expect(buildExamplePayload("parse", "cohere/parse-v5.0")).toEqual({
			model: "cohere/parse-v5.0",
			document: {
				type: "image_url",
				image_url: "https://cohere.com/favicon-32x32.png",
			},
			output_format: "markdown",
		});
	});
});

describe("Decisions quickstart", () => {
	test("uses the public Decisions route and typed question payload", () => {
		expect(resolveGatewayPath("decisions.make")).toBe("/decisions");
		expect(ENDPOINT_OPTIONS).toContainEqual({
			value: "decisions",
			label: "Decisions",
		});
		expect(
			buildEndpointRoutes([{ value: "decisions", label: "Decisions" }]),
		).toEqual([
			expect.objectContaining({
				value: "decisions",
				method: "POST",
				path: "/v1/decisions",
			}),
		]);

		expect(buildExamplePayload("decisions", "typesafe/jev-1.13.0")).toMatchObject({
			model: "typesafe/jev-1.13.0",
			state: expect.objectContaining({ account_tier: "pro" }),
			questions: expect.objectContaining({
				department: expect.objectContaining({ type: "choice" }),
				is_urgent: expect.objectContaining({
					type: "noul",
					criteria: expect.objectContaining({
						true: expect.any(String),
						false: expect.any(String),
					}),
				}),
				customer_impact: expect.objectContaining({ type: "score" }),
			}),
		});
	});

	test("preserves string criteria keys in Python examples", () => {
		const payload = buildExamplePayload("decisions", "typesafe/jev-1.13.0");
		const python = jsonToPythonLiteral(JSON.stringify(payload, null, 2));

		expect(python).toContain('"true": "The customer is blocked');
		expect(python).toContain('"false": "The request can follow');
	});
});
