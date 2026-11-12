import { describe, expect, it } from "vitest";
import { checksCountLabel } from "./checksLogic";

describe("the checks count", () => {
	it("reads running out of all, then failures, then nothing", () => {
		expect(checksCountLabel([{ name: "a", status: "pending" }, { name: "b", status: "success" }, { name: "c", status: "failure" }])).toBe("1/3");
		expect(checksCountLabel([{ name: "a", status: "cancelled" }, { name: "b", status: "failure" }])).toBe("2 failed");
		expect(checksCountLabel([{ name: "a", status: "success" }])).toBeNull();
	});
});
