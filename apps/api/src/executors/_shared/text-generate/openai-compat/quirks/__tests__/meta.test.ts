import { describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { applyResponsesRequestQuirks } from "../../responses-quirks";
import { applyChatRequestQuirks } from "../../chat-quirks";

const ir = { model: "meta/muse-wonder-1.0", messages: [] } as IRChatRequest;

describe.each([
	["responses", applyResponsesRequestQuirks],
	["chat", applyChatRequestQuirks],
] as const)("Meta %s service tiers", (_endpoint, applyQuirks) => {
	it("translates standard to Meta's default without changing the IR", () => {
		const request = { service_tier: "standard" };
		const original = { ...ir, serviceTier: "standard" } as IRChatRequest;
		applyQuirks({ providerId: "meta", ir: original, request });
		expect(request.service_tier).toBe("default");
		expect(original.serviceTier).toBe("standard");
	});

	it.each(["auto", "default", "flex", "scale", "priority", undefined])(
		"preserves the upstream tier %s",
		(service_tier) => {
			const request = { service_tier };
			applyQuirks({ providerId: "meta", ir, request });
			expect(request.service_tier).toBe(service_tier);
		},
	);
});
