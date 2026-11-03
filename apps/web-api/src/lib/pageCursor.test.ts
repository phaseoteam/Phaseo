import { describe, expect, it } from "vitest";
import { validPageCursor } from "./pageCursor";

const id = "3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b";

describe("validPageCursor", () => {
	it("accepts the timestamps PostgREST returns and a UUID", () => {
		for (const createdAt of ["2026-11-03T14:38:10.123456+00:00", "2026-11-03T14:38:10+00:00", "2026-11-03T14:38:10.1Z"]) {
			expect(validPageCursor({ createdAt, id })).toEqual({ createdAt, id });
		}
	});

	it("rejects anything that could add conditions to a PostgREST filter", () => {
		for (const cursor of [
			{ createdAt: "2026-11-03T14:38:10Z,workspace_id.neq.x", id },
			{ createdAt: "Tue, 03 Nov 2026 14:38:10 GMT", id },
			{ createdAt: "2026-11-03", id },
			{ createdAt: "2026-11-03T14:38:10Z", id: `${id}),or(id.gt.0` },
			{ createdAt: "2026-11-03T14:38:10Z", id: "------------------------------------" },
			{ createdAt: 1, id },
			null,
		]) {
			expect(validPageCursor(cursor as never)).toBeNull();
		}
	});
});
