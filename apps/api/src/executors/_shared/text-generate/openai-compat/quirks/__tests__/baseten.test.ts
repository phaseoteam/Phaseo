// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import { describe, expect, it } from "vitest";
import { basetenQuirks } from "../../providers/baseten/quirks";

describe("Baseten quirks", () => {
	it("maps reasoning.enabled=true to chat_template_args.enable_thinking=true", () => {
		const request: Record<string, unknown> = {};
		const ir: any = {
			reasoning: {
				enabled: true,
			},
		};

		basetenQuirks.transformRequest?.({ request, ir });

		expect(request.chat_template_args).toEqual({
			enable_thinking: true,
		});
	});

	it("maps reasoning.enabled=false to chat_template_args.enable_thinking=false", () => {
		const request: Record<string, unknown> = {};
		const ir: any = {
			reasoning: {
				enabled: false,
			},
		};

		basetenQuirks.transformRequest?.({ request, ir });

		expect(request.chat_template_args).toEqual({
			enable_thinking: false,
		});
	});

	it("maps reasoning.effort=none to chat_template_args.enable_thinking=false", () => {
		const request: Record<string, unknown> = {};
		const ir: any = {
			reasoning: {
				effort: "none",
			},
		};

		basetenQuirks.transformRequest?.({ request, ir });

		expect(request.chat_template_args).toEqual({
			enable_thinking: false,
		});
	});

	it("maps reasoning.effort=high to chat_template_args.enable_thinking=true", () => {
		const request: Record<string, unknown> = {};
		const ir: any = {
			reasoning: {
				effort: "high",
			},
		};

		basetenQuirks.transformRequest?.({ request, ir });

		expect(request.chat_template_args).toEqual({
			enable_thinking: true,
		});
	});

	it("preserves existing chat_template_args keys", () => {
		const request: Record<string, any> = {
			chat_template_args: {
				other_flag: "x",
			},
		};
		const ir: any = {
			reasoning: {
				enabled: true,
			},
		};

		basetenQuirks.transformRequest?.({ request, ir });

		expect(request.chat_template_args).toEqual({
			other_flag: "x",
			enable_thinking: true,
		});
	});

	it("does not mutate request when reasoning is absent", () => {
		const request: Record<string, unknown> = {};
		const ir: any = {};

		basetenQuirks.transformRequest?.({ request, ir });

		expect(request.chat_template_args).toBeUndefined();
	});
});

