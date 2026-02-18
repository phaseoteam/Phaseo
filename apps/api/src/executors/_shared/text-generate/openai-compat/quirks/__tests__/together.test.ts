import { describe, expect, it } from "vitest";
import { togetherQuirks } from "../../providers/together/quirks";

describe("Together quirks", () => {
	it("maps developer role to system", () => {
		const request: Record<string, any> = {
			messages: [
				{ role: "developer", content: "You are concise." },
				{ role: "user", content: "hi" },
			],
		};

		togetherQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.messages[0].role).toBe("system");
		expect(request.messages[1].role).toBe("user");
	});

	it("maps tool_choice function object to tool name string", () => {
		const request: Record<string, any> = {
			tool_choice: {
				type: "function",
				function: { name: "get_weather" },
			},
		};

		togetherQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.tool_choice).toBe("get_weather");
	});

	it("maps reasoning effort to together reasoning_effort", () => {
		const request: Record<string, any> = {};
		const ir: any = {
			reasoning: {
				effort: "xhigh",
			},
		};

		togetherQuirks.transformRequest?.({ request, ir });

		expect(request.reasoning_effort).toBe("high");
	});

	it("maps reasoning enabled=true to default low effort", () => {
		const request: Record<string, any> = {};
		const ir: any = {
			reasoning: {
				enabled: true,
			},
		};

		togetherQuirks.transformRequest?.({ request, ir });

		expect(request.reasoning_effort).toBe("low");
	});

	it("drops unsupported 'none' reasoning effort by omitting field", () => {
		const request: Record<string, any> = {
			reasoning: { effort: "none" },
		};
		const ir: any = {
			reasoning: {
				effort: "none",
			},
		};

		togetherQuirks.transformRequest?.({ request, ir });

		expect(request.reasoning_effort).toBeUndefined();
		expect(request.reasoning).toBeUndefined();
	});
});

