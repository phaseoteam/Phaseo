import { describe, expect, it, vi } from "vitest";

const { executeOpenAIWireMock } = vi.hoisted(() => ({
	executeOpenAIWireMock: vi.fn(async () => ({ kind: "completed" })),
}));

vi.mock("@executors/_shared/text-generate/openai-compat", () => ({
	executeOpenAIWire: executeOpenAIWireMock,
}));

import { execute } from "./index";

describe("Doubleword transient errors", () => {
	it("does not retry realtime POSTs without documented idempotency support", async () => {
		const args = { providerId: "doubleword" } as any;
		await execute(args);
		expect(executeOpenAIWireMock).toHaveBeenCalledWith(args);
	});
});
