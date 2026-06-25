import { describe, expect, it } from "vitest";
import { deepinfraQuirks } from "../../providers/deepinfra/quirks";

describe("DeepInfra quirks", () => {
	it("drops service_tier after gateway routing has consumed it", () => {
		const request: Record<string, any> = {
			model: "MiniMaxAI/MiniMax-M2.7-Turbo",
			service_tier: "priority",
			messages: [{ role: "user", content: "hello" }],
		};

		deepinfraQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.service_tier).toBeUndefined();
		expect(request.model).toBe("MiniMaxAI/MiniMax-M2.7-Turbo");
	});
});
