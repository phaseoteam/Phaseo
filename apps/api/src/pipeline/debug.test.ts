import { describe, expect, it, vi } from "vitest";
import { logDebugEvent } from "./debug";

describe("logDebugEvent", () => {
	it("does not redact mapped request/response in console debug logs", async () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			await logDebugEvent("executor.result", {
				mappedRequest: { model: "gemini-2.5-flash-image" },
				rawResponse: { error: { message: "404" } },
			});
			expect(spy).toHaveBeenCalledTimes(1);
			const payload = String(spy.mock.calls[0]?.[1] ?? "");
			expect(payload).toContain("\"mappedRequest\":{\"model\":\"gemini-2.5-flash-image\"}");
			expect(payload).toContain("\"rawResponse\":{\"error\":{\"message\":\"404\"}}");
			expect(payload).not.toContain("[redacted]");
		} finally {
			spy.mockRestore();
		}
	});
});
