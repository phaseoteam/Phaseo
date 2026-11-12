import { describe, expect, it, vi } from "vitest";
import { internalRouter } from "./internal";

vi.mock("@/auth/requireUser", () => ({ requireUser: vi.fn(async () => null) }));

function revalidate(authorization: string | null) {
	return internalRouter.request("https://phaseo.app/revalidate", {
		method: "POST",
		headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
		body: JSON.stringify({ tags: [] }),
	}, { REVALIDATION_SECRET: "rev_secret_value" } as never);
}

describe("internal revalidate secret", () => {
	it("rejects a missing, wrong or prefix-only secret", async () => {
		for (const authorization of [null, "Bearer wrong", "Bearer rev_secret", "Bearer rev_secret_value2", "rev_secret_value"]) {
			const response = await revalidate(authorization);
			expect(response.status, String(authorization)).toBe(401);
		}
	});

	it("accepts the configured secret", async () => {
		const response = await revalidate("Bearer rev_secret_value");
		// Authorized; the empty tag list is then rejected as invalid input.
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "invalid_tags" });
	});
});
