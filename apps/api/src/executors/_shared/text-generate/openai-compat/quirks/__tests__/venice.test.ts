import { describe, expect, it } from "vitest";
import { veniceQuirks } from "../../providers/venice/quirks";

describe("Venice quirks", () => {
	it("maps responses input_items to input", () => {
		const request: Record<string, any> = {
			model: "llama-3.2-3b",
			input_items: [{
				type: "message",
				role: "user",
				content: [{ type: "input_text", text: "hi" }],
			}],
		};

		veniceQuirks.transformRequest?.({
			request,
			ir: {} as any,
			model: "llama-3.2-3b",
		});

		expect(Array.isArray(request.input)).toBe(true);
		expect(request.input_items).toBeUndefined();
	});
});
