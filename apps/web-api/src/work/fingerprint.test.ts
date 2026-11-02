import { describe, expect, it } from "vitest";
import { culpritFor, fingerprintError, fingerprintFile, fingerprintInput, normaliseMessage } from "./fingerprint";
import { parseStack } from "./stack";

const stackAt = (line: number, file = "https://app.example.com/assets/app.js") => `TypeError: x is undefined
    at renderRow (${file}:${line}:17)
    at loadPage (${file}:${line + 20}:5)
    at https://unpkg.com/lib@1/lib.js:1:1`;

describe("fingerprintError", () => {
	it("gives the same fingerprint for the same error on different lines", async () => {
		const a = await fingerprintError({ type: "TypeError", message: "x is undefined", frames: parseStack(stackAt(10)) });
		const b = await fingerprintError({ type: "TypeError", message: "x is undefined (again)", frames: parseStack(stackAt(250)) });
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(b).toBe(a);
	});

	it("ignores query strings, hosts and bundle hashes in files", async () => {
		const a = await fingerprintError({ type: "TypeError", message: "", frames: parseStack(stackAt(10, "https://a.example.com/assets/app.3f9a1c2b.js?v=1")) });
		const b = await fingerprintError({ type: "TypeError", message: "", frames: parseStack(stackAt(12, "https://b.example.com/assets/app.77de10aa.js")) });
		expect(b).toBe(a);
	});

	it("gives a different fingerprint for a different type", async () => {
		const frames = parseStack(stackAt(10));
		const a = await fingerprintError({ type: "TypeError", message: "x", frames });
		const b = await fingerprintError({ type: "RangeError", message: "x", frames });
		expect(b).not.toBe(a);
	});

	it("falls back to the normalised message without in-app frames", async () => {
		const a = await fingerprintError({ type: "Error", message: "Order 1234 failed for 0x1f2e user 6b1f3c2e-8d4a-4f5b-9c7e-1a2b3c4d5e6f", frames: [] });
		const b = await fingerprintError({ type: "Error", message: "Order 98 failed for 0xabc user 00000000-0000-0000-0000-00000000000a", frames: [] });
		const c = await fingerprintError({ type: "Error", message: "Payment failed", frames: [] });
		expect(b).toBe(a);
		expect(c).not.toBe(a);
		expect(fingerprintInput({ type: "Error", message: "a", frames: [{ file: "x", inApp: false }] })).toBe("message\nError\na");
	});

	it("uses at most five in-app frames", () => {
		const frames = Array.from({ length: 8 }, (_, index) => ({ function: `f${index}`, file: "/a.js", line: index, inApp: true }));
		expect(fingerprintInput({ type: "E", message: "", frames }).split("\n")).toHaveLength(2 + 5);
	});
});

describe("helpers", () => {
	it("normalises messages", () => {
		expect(normaliseMessage("Timeout after 3000ms on job deadbeef12 (id 6b1f3c2e-8d4a-4f5b-9c7e-1a2b3c4d5e6f)"))
			.toBe("Timeout after <n>ms on job <hex> (id <uuid>)");
		expect(normaliseMessage("Cannot   read\nproperty")).toBe("Cannot read property");
	});

	it("strips origins and hashes from files", () => {
		expect(fingerprintFile("https://x.example/static/js/main.a1b2c3d4.js?x#y")).toBe("/static/js/main.<hash>.js");
		expect(fingerprintFile("/srv/app/src/index.ts")).toBe("/srv/app/src/index.ts");
	});

	it("names the culprit from the top in-app frame", () => {
		expect(culpritFor(parseStack(stackAt(10)))).toBe("renderRow (/assets/app.js:10)");
		expect(culpritFor([{ file: "x", inApp: false }])).toBeNull();
	});
});
