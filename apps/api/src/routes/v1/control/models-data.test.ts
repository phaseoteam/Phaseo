import { beforeEach, describe, expect, it, vi } from "vitest";

const guardAuthMock = vi.fn();
const getSupabaseAdminMock = vi.fn();

vi.mock("@pipeline/before/guards", () => ({
	guardAuth: (...args: any[]) => guardAuthMock(...args),
}));

vi.mock("@/runtime/env", async () => {
	const actual = await vi.importActual<typeof import("@/runtime/env")>("@/runtime/env");
	return {
		...actual,
		getSupabaseAdmin: (...args: any[]) => getSupabaseAdminMock(...args),
	};
});

import { handleDataModels } from "./models-data";

describe("handleDataModels", () => {
	beforeEach(() => {
		guardAuthMock.mockReset();
		getSupabaseAdminMock.mockReset();
	});

	it("forbids include_hidden for non-internal callers", async () => {
		guardAuthMock.mockResolvedValue({
			ok: true,
			value: {
				internal: false,
			},
		});

		const response = await handleDataModels(
			new Request("https://api.example.com/v1/control/data/models?include_hidden=true"),
		);

		expect(response.status).toBe(403);
		expect(getSupabaseAdminMock).not.toHaveBeenCalled();
		const payload = await response.json();
		expect(payload.error).toBe("forbidden");
	});
});
