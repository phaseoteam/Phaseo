import { describe, expect, it } from "vitest";
import { applyResponseHealingPlugin } from "./response-healing";

function buildArgs(overrides?: Partial<Parameters<typeof applyResponseHealingPlugin>[0]>) {
	return {
		ctx: {
			stream: false,
			endpoint: "chat.completions",
			body: { response_format: { type: "json_object" } },
		} as any,
		result: {} as any,
		payload: {
			choices: [
				{
					message: {
						content: "```json\n{foo: 1,}\n```",
					},
				},
			],
		},
		plugin: { id: "response-healing", enabled: true, config: {} },
		finishReason: "stop",
		...overrides,
	};
}

describe("applyResponseHealingPlugin", () => {
	it("repairs malformed chat-completions JSON output", () => {
		const outcome = applyResponseHealingPlugin(buildArgs());

		expect(outcome.payload.choices[0].message.content).toBe('{"foo":1}');
		expect(outcome.execution).toMatchObject({
			id: "response-healing",
			stage: "response.post_provider",
			changed: true,
			status: "applied",
			metadata: expect.objectContaining({
				attempted: true,
				healed: true,
				mode: "safe",
				transforms_applied: expect.arrayContaining([
					"strip_markdown_fence",
					"remove_trailing_commas",
					"quote_bare_keys",
				]),
			}),
		});
	});

	it("skips streaming requests", () => {
		const outcome = applyResponseHealingPlugin(
			buildArgs({
				ctx: {
					stream: true,
					endpoint: "chat.completions",
					body: { response_format: { type: "json_object" } },
				} as any,
			}),
		);

		expect(outcome.payload.choices[0].message.content).toBe("```json\n{foo: 1,}\n```");
		expect(outcome.execution).toMatchObject({
			changed: false,
			status: "skipped",
			metadata: expect.objectContaining({
				attempted: false,
				healed: false,
				failure_reason: "streaming_unsupported",
			}),
		});
	});

	it("repairs malformed responses output_text payloads", () => {
		const outcome = applyResponseHealingPlugin(
			buildArgs({
				ctx: {
					stream: false,
					endpoint: "responses",
					body: { text: { format: { type: "json_schema" } } },
				} as any,
				payload: {
					output: [
						{
							type: "message",
							content: [
								{ type: "output_text", text: '{"items":[1,2,]}' },
								{ type: "output_text", text: '{"ignored":true}' },
							],
						},
					],
				},
			}),
		);

		expect(outcome.payload.output[0].content).toEqual([
			{ type: "output_text", text: '{"items":[1,2]}' },
		]);
		expect(outcome.execution.status).toBe("applied");
	});

	it("uses strict mode to avoid syntactic repair transforms beyond wrapper extraction", () => {
		const outcome = applyResponseHealingPlugin(
			buildArgs({
				plugin: {
					id: "response-healing",
					enabled: true,
					config: { mode: "strict" },
				},
			}),
		);

		expect(outcome.payload.choices[0].message.content).toBe("```json\n{foo: 1,}\n```");
		expect(outcome.execution).toMatchObject({
			changed: false,
			status: "skipped",
			metadata: expect.objectContaining({
				attempted: true,
				healed: false,
				mode: "strict",
				failure_reason: "unrepairable",
				transforms_applied: expect.arrayContaining([
					"strip_markdown_fence",
				]),
			}),
		});
	});

	it("uses strict mode to unwrap valid fenced JSON without broader repair transforms", () => {
		const outcome = applyResponseHealingPlugin(
			buildArgs({
				payload: {
					choices: [
						{
							message: {
								content: "```json\n{\"ok\":true}\n```",
							},
						},
					],
				},
				plugin: {
					id: "response-healing",
					enabled: true,
					config: { mode: "strict" },
				},
			}),
		);

		expect(outcome.payload.choices[0].message.content).toBe('{"ok":true}');
		expect(outcome.execution).toMatchObject({
			changed: true,
			status: "applied",
			metadata: expect.objectContaining({
				attempted: true,
				healed: true,
				mode: "strict",
				transforms_applied: ["strip_markdown_fence"],
			}),
		});
	});

	it("heals the first recoverable responses text block when prose appears before JSON", () => {
		const outcome = applyResponseHealingPlugin(
			buildArgs({
				ctx: {
					stream: false,
					endpoint: "responses",
					body: { text: { format: { type: "json_schema" } } },
				} as any,
				payload: {
					output: [
						{
							type: "message",
							content: [
								{ type: "output_text", text: "Here is the result you asked for:" },
								{ type: "output_text", text: "```json\n{items: [1,2,],}\n```" },
							],
						},
					],
				},
			}),
		);

		expect(outcome.payload.output[0].content).toEqual([
			{ type: "output_text", text: '{"items":[1,2]}' },
		]);
		expect(outcome.execution).toMatchObject({
			changed: true,
			status: "applied",
			metadata: expect.objectContaining({
				attempted: true,
				healed: true,
			}),
		});
	});

	it("collapses prose plus already-valid JSON down to the selected responses text block", () => {
		const outcome = applyResponseHealingPlugin(
			buildArgs({
				ctx: {
					stream: false,
					endpoint: "responses",
					body: { text: { format: { type: "json_schema" } } },
				} as any,
				payload: {
					output: [
						{
							type: "message",
							content: [
								{ type: "output_text", text: "Here is the result you asked for:" },
								{ type: "output_text", text: '{"items":[1,2]}' },
							],
						},
					],
				},
			}),
		);

		expect(outcome.payload.output[0].content).toEqual([
			{ type: "output_text", text: '{"items":[1,2]}' },
		]);
		expect(outcome.execution).toMatchObject({
			changed: true,
			status: "applied",
			metadata: expect.objectContaining({
				attempted: true,
				healed: false,
			}),
		});
	});

	it("collapses prose plus already-valid JSON text blocks on the messages surface", () => {
		const outcome = applyResponseHealingPlugin(
			buildArgs({
				ctx: {
					stream: false,
					endpoint: "messages",
					body: { response_format: { type: "json_schema", schema: { type: "object" } } },
				} as any,
				payload: {
					content: [
						{ type: "text", text: "Here is the answer:" },
						{ type: "text", text: '{"ok":true}' },
					],
				},
			}),
		);

		expect(outcome.payload.content).toEqual([
			{ type: "text", text: '{"ok":true}' },
		]);
		expect(outcome.execution).toMatchObject({
			changed: true,
			status: "applied",
			metadata: expect.objectContaining({
				attempted: true,
				healed: false,
			}),
		});
	});

	it("skips rewriting when healed JSON violates the declared schema", () => {
		const outcome = applyResponseHealingPlugin(
			buildArgs({
				ctx: {
					stream: false,
					endpoint: "chat.completions",
					body: {
						response_format: {
							type: "json_schema",
							schema: {
								type: "object",
								required: ["ok"],
								properties: {
									ok: { type: "boolean" },
								},
								additionalProperties: false,
							},
						},
					},
				} as any,
				payload: {
					choices: [
						{
							message: {
								content: "```json\n{foo: 1,}\n```",
							},
						},
					],
				},
			}),
		);

		expect(outcome.payload.choices[0].message.content).toBe("```json\n{foo: 1,}\n```");
		expect(outcome.execution).toMatchObject({
			changed: false,
			status: "skipped",
			metadata: expect.objectContaining({
				attempted: true,
				healed: false,
				failure_reason: "schema_mismatch",
				validation_errors: expect.arrayContaining([
					"$.ok is required",
					"$.foo is not allowed",
				]),
			}),
		});
	});

	it("continues scanning later text blocks until one matches the declared schema", () => {
		const outcome = applyResponseHealingPlugin(
			buildArgs({
				ctx: {
					stream: false,
					endpoint: "responses",
					body: {
						text: {
							format: {
								type: "json_schema",
								schema: {
									type: "object",
									required: ["ok"],
									properties: {
										ok: { type: "boolean" },
									},
									additionalProperties: false,
								},
							},
						},
					},
				} as any,
				payload: {
					output: [
						{
							type: "message",
							content: [
								{ type: "output_text", text: '{"foo":1}' },
								{ type: "output_text", text: '{"ok":true}' },
							],
						},
					],
				},
			}),
		);

		expect(outcome.payload.output[0].content).toEqual([
			{ type: "output_text", text: '{"ok":true}' },
		]);
		expect(outcome.execution).toMatchObject({
			changed: true,
			status: "applied",
			metadata: expect.objectContaining({
				attempted: true,
			}),
		});
	});

	it("enforces string and numeric schema constraints before rewriting", () => {
		const outcome = applyResponseHealingPlugin(
			buildArgs({
				ctx: {
					stream: false,
					endpoint: "chat.completions",
					body: {
						response_format: {
							type: "json_schema",
							schema: {
								type: "object",
								required: ["code", "score"],
								properties: {
									code: { type: "string", minLength: 3, pattern: "^[A-Z]+$" },
									score: { type: "number", minimum: 10, maximum: 20, multipleOf: 5 },
								},
								additionalProperties: false,
							},
						},
					},
				} as any,
				payload: {
					choices: [
						{
							message: {
								content: '{"code":"ab","score":7}',
							},
						},
					],
				},
			}),
		);

		expect(outcome.execution).toMatchObject({
			changed: false,
			status: "skipped",
			metadata: expect.objectContaining({
				attempted: true,
				failure_reason: "schema_mismatch",
				validation_errors: expect.arrayContaining([
					"$.code must be at least 3 character(s)",
					"$.code does not match the required pattern",
					"$.score must be greater than or equal to 10",
					"$.score must be a multiple of 5",
				]),
			}),
		});
	});

	it("selects a later candidate when earlier JSON violates string or numeric schema constraints", () => {
		const outcome = applyResponseHealingPlugin(
			buildArgs({
				ctx: {
					stream: false,
					endpoint: "responses",
					body: {
						text: {
							format: {
								type: "json_schema",
								schema: {
									type: "object",
									required: ["code", "score"],
									properties: {
										code: { type: "string", minLength: 3, pattern: "^[A-Z]+$" },
										score: { type: "number", minimum: 10, maximum: 20, multipleOf: 5 },
									},
									additionalProperties: false,
								},
							},
						},
					},
				} as any,
				payload: {
					output: [
						{
							type: "message",
							content: [
								{ type: "output_text", text: '{"code":"ab","score":7}' },
								{ type: "output_text", text: '{"code":"ABC","score":15}' },
							],
						},
					],
				},
			}),
		);

		expect(outcome.payload.output[0].content).toEqual([
			{ type: "output_text", text: '{"code":"ABC","score":15}' },
		]);
		expect(outcome.execution).toMatchObject({
			changed: true,
			status: "applied",
			metadata: expect.objectContaining({
				attempted: true,
			}),
		});
	});

	it("enforces string format and uniqueItems constraints before rewriting", () => {
		const outcome = applyResponseHealingPlugin(
			buildArgs({
				ctx: {
					stream: false,
					endpoint: "chat.completions",
					body: {
						response_format: {
							type: "json_schema",
							schema: {
								type: "object",
								required: ["email", "homepage", "runId", "updatedAt", "tags"],
								properties: {
									email: { type: "string", format: "email" },
									homepage: { type: "string", format: "uri" },
									runId: { type: "string", format: "uuid" },
									updatedAt: { type: "string", format: "date-time" },
									tags: {
										type: "array",
										uniqueItems: true,
										items: { type: "string" },
									},
								},
								additionalProperties: false,
							},
						},
					},
				} as any,
				payload: {
					choices: [
						{
							message: {
								content: JSON.stringify({
									email: "not-an-email",
									homepage: "notaurl",
									runId: "abc",
									updatedAt: "yesterday",
									tags: ["dup", "dup"],
								}),
							},
						},
					],
				},
			}),
		);

		expect(outcome.execution).toMatchObject({
			changed: false,
			status: "skipped",
			metadata: expect.objectContaining({
				attempted: true,
				failure_reason: "schema_mismatch",
				validation_errors: expect.arrayContaining([
					"$.email must match the email format",
					"$.homepage must match the uri format",
					"$.runId must match the uuid format",
					"$.updatedAt must match the date-time format",
					"$.tags must contain only unique items",
				]),
			}),
		});
	});

	it("selects a later candidate when earlier JSON violates format or uniqueItems constraints", () => {
		const outcome = applyResponseHealingPlugin(
			buildArgs({
				ctx: {
					stream: false,
					endpoint: "responses",
					body: {
						text: {
							format: {
								type: "json_schema",
								schema: {
									type: "object",
									required: ["email", "homepage", "runId", "updatedAt", "tags"],
									properties: {
										email: { type: "string", format: "email" },
										homepage: { type: "string", format: "uri" },
										runId: { type: "string", format: "uuid" },
										updatedAt: { type: "string", format: "date-time" },
										tags: {
											type: "array",
											uniqueItems: true,
											items: { type: "string" },
										},
									},
									additionalProperties: false,
								},
							},
						},
					},
				} as any,
				payload: {
					output: [
						{
							type: "message",
							content: [
								{
									type: "output_text",
									text: JSON.stringify({
										email: "not-an-email",
										homepage: "notaurl",
										runId: "abc",
										updatedAt: "yesterday",
										tags: ["dup", "dup"],
									}),
								},
								{
									type: "output_text",
									text: JSON.stringify({
										email: "team@example.com",
										homepage: "https://phaseo.app/docs",
										runId: "123e4567-e89b-42d3-a456-426614174000",
										updatedAt: "2026-05-09T12:00:00Z",
										tags: ["ops", "gateway"],
									}),
								},
							],
						},
					],
				},
			}),
		);

		expect(outcome.payload.output[0].content).toEqual([
			{
				type: "output_text",
				text: JSON.stringify({
					email: "team@example.com",
					homepage: "https://phaseo.app/docs",
					runId: "123e4567-e89b-42d3-a456-426614174000",
					updatedAt: "2026-05-09T12:00:00Z",
					tags: ["ops", "gateway"],
				}),
			},
		]);
		expect(outcome.execution).toMatchObject({
			changed: true,
			status: "applied",
			metadata: expect.objectContaining({
				attempted: true,
			}),
		});
	});

	it("skips healing for non-structured requests", () => {
		const outcome = applyResponseHealingPlugin(
			buildArgs({
				ctx: {
					stream: false,
					endpoint: "chat.completions",
					body: {},
				} as any,
			}),
		);

		expect(outcome.payload.choices[0].message.content).toBe("```json\n{foo: 1,}\n```");
		expect(outcome.execution).toMatchObject({
			changed: false,
			status: "skipped",
			metadata: expect.objectContaining({
				attempted: false,
				healed: false,
				failure_reason: "not_json",
			}),
		});
	});

	it("does not append missing closers for truncated completions", () => {
		const outcome = applyResponseHealingPlugin(
			buildArgs({
				payload: {
					choices: [
						{
							message: {
								content: '{"foo": {"bar": 1',
							},
						},
					],
				},
				finishReason: "length",
			}),
		);

		expect(outcome.payload.choices[0].message.content).toBe('{"foo": {"bar": 1');
		expect(outcome.execution).toMatchObject({
			changed: false,
			status: "skipped",
			metadata: expect.objectContaining({
				attempted: true,
				healed: false,
				failure_reason: "truncated",
			}),
		});
	});
});
