import { describe, expect, it } from "vitest";
import { activitySummary } from "./activitySummary";

describe("tool row detail", () => {
	it("names what JSON arguments are about instead of showing a brace", () => {
		expect(activitySummary(JSON.stringify({ title: "Sales by month", html: "<div>…</div>" }, null, 2))).toBe("Sales by month");
		expect(activitySummary('{"command":"pnpm test","cwd":"x"}')).toBe("pnpm test");
		expect(activitySummary(JSON.stringify({ html: "<p>x</p>" }, null, 2))).toBe("");
		expect(activitySummary("{\n  not json")).toBe("");
	});
	it("keeps plain text as its first line", () => {
		expect(activitySummary("src/app.ts\n+12 −3")).toBe("src/app.ts");
		expect(activitySummary("")).toBe("");
	});
});
