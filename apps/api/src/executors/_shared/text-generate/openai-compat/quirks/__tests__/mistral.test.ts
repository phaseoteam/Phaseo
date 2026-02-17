import { describe, expect, it } from "vitest";
import { mistralQuirks } from "../../providers/mistral/quirks";

describe("Mistral quirks", () => {
	it("maps developer role to system and seed to random_seed", () => {
		const request: Record<string, any> = {
			model: "mistral-large-latest",
			messages: [
				{ role: "developer", content: "Be concise." },
				{ role: "user", content: "hello" },
			],
			seed: 7,
		};

		mistralQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.messages[0].role).toBe("system");
		expect(request.seed).toBeUndefined();
		expect(request.random_seed).toBe(7);
	});

	it("keeps json_schema response_format unchanged", () => {
		const request: Record<string, any> = {
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "answer",
					schema: {
						type: "object",
						properties: {
							value: { type: "string" },
						},
						required: ["value"],
					},
					strict: true,
				},
			},
			messages: [{ role: "user", content: "Return JSON." }],
		};

		mistralQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.response_format).toEqual({
			type: "json_schema",
			json_schema: {
				name: "answer",
				schema: {
					type: "object",
					properties: {
						value: { type: "string" },
					},
					required: ["value"],
				},
				strict: true,
			},
		});
	});

	it("drops unsupported OpenAI-only fields on chat payloads", () => {
		const request: Record<string, any> = {
			model: "mistral-large-latest",
			messages: [{ role: "user", content: "hello" }],
			service_tier: "default",
			speed: "fast",
			prompt_cache_key: "cache_1",
			safety_identifier: "safe_1",
			background: true,
			modalities: ["text"],
			image_config: { aspect_ratio: "1:1" },
		};

		mistralQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.service_tier).toBeUndefined();
		expect(request.speed).toBeUndefined();
		expect(request.prompt_cache_key).toBeUndefined();
		expect(request.safety_identifier).toBeUndefined();
		expect(request.background).toBeUndefined();
		expect(request.modalities).toBeUndefined();
		expect(request.image_config).toBeUndefined();
	});
});
