import { describe, expect, it } from "vitest";
import { isVendorFile, normaliseFrames, parseStack } from "./stack";

const CHROME = `TypeError: Cannot read properties of undefined (reading 'id')
    at renderRow (https://app.example.com/assets/table.js?v=12:40:17)
    at async loadPage (https://app.example.com/assets/app.js#main:10:5)
    at new Widget (https://app.example.com/assets/widget.js:3:9)
    at https://app.example.com/assets/app.js:99:1
    at Array.map (<anonymous>)
    at eval (eval at compile (https://app.example.com/assets/app.js:5:6), <anonymous>:1:1)
    at https://cdn.jsdelivr.net/npm/lib@1/dist/lib.js:1:200
    at Object.<anonymous> (/srv/app/node_modules/express/lib/router.js:12:3)`;

const FIREFOX = `renderRow@https://app.example.com/assets/table.js?v=12:40:17
loadPage/<@https://app.example.com/assets/app.js:10:5
@https://app.example.com/assets/app.js:99:1
handler@moz-extension://abc/content.js:2:3`;

const SAFARI = `renderRow@https://app.example.com/assets/table.js:40:17
loadPage@https://app.example.com/assets/app.js:10:5
global code@https://app.example.com/assets/app.js:99:1
map@[native code]
https://app.example.com/assets/app.js:7`;

describe("parseStack", () => {
	it("parses Chrome/V8 stacks, stripping query strings and hashes", () => {
		const frames = parseStack(CHROME);
		expect(frames[0]).toEqual({ function: "renderRow", file: "https://app.example.com/assets/table.js", line: 40, column: 17, inApp: true });
		expect(frames[1]).toMatchObject({ function: "loadPage", file: "https://app.example.com/assets/app.js", line: 10 });
		expect(frames[2]).toMatchObject({ function: "Widget", file: "https://app.example.com/assets/widget.js" });
		expect(frames[3]).toEqual({ file: "https://app.example.com/assets/app.js", line: 99, column: 1, inApp: true });
		expect(frames[4]).toMatchObject({ function: "Array.map", inApp: false });
		expect(frames[5]).toMatchObject({ function: "eval", file: "https://app.example.com/assets/app.js", line: 5, column: 6 });
		expect(frames[6]).toMatchObject({ inApp: false });
		expect(frames[7]).toMatchObject({ function: "Object.<anonymous>", inApp: false });
		expect(frames).toHaveLength(8);
	});

	it("parses Firefox stacks", () => {
		const frames = parseStack(FIREFOX);
		expect(frames).toEqual([
			{ function: "renderRow", file: "https://app.example.com/assets/table.js", line: 40, column: 17, inApp: true },
			{ function: "loadPage", file: "https://app.example.com/assets/app.js", line: 10, column: 5, inApp: true },
			{ file: "https://app.example.com/assets/app.js", line: 99, column: 1, inApp: true },
			{ function: "handler", file: "moz-extension://abc/content.js", line: 2, column: 3, inApp: false },
		]);
	});

	it("parses Safari stacks, including native frames", () => {
		const frames = parseStack(SAFARI);
		expect(frames[0]).toMatchObject({ function: "renderRow", line: 40, inApp: true });
		expect(frames[2]).toMatchObject({ function: "global code", line: 99 });
		expect(frames[3]).toEqual({ function: "map", file: "[native code]", inApp: false });
		expect(frames).toHaveLength(4);
	});

	it("returns nothing for empty or non-string input", () => {
		expect(parseStack("")).toEqual([]);
		expect(parseStack(undefined)).toEqual([]);
		expect(parseStack("just a message")).toEqual([]);
	});
});

describe("frames", () => {
	it("marks library, extension and CDN code as not in-app", () => {
		expect(isVendorFile("/app/node_modules/react-dom/index.js")).toBe(true);
		expect(isVendorFile("C:\\app\\node_modules\\x.js")).toBe(true);
		expect(isVendorFile("chrome-extension://abcdef/inject.js")).toBe(true);
		expect(isVendorFile("https://unpkg.com/x@1/x.js")).toBe(true);
		expect(isVendorFile("https://phaseo.app/api/_web/work/errors.js")).toBe(true);
		expect(isVendorFile("https://app.example.com/assets/app.js")).toBe(false);
		expect(isVendorFile(undefined)).toBe(false);
	});

	it("normalises frames sent by callers and drops junk", () => {
		const frames = normaliseFrames([
			{ function: "  run ", file: "/srv/app/jobs.ts?x=1", line: 4, column: 2 },
			{ function: "lib", file: "/srv/app/node_modules/lib/index.js", inApp: true },
			{ function: "mine", file: "/srv/app/x.ts", inApp: false },
			"nope",
			{ line: 3 },
			{ function: "bad", line: -1, column: 1.5 },
		]);
		expect(frames).toEqual([
			{ function: "run", file: "/srv/app/jobs.ts", line: 4, column: 2, inApp: true },
			{ function: "lib", file: "/srv/app/node_modules/lib/index.js", inApp: false },
			{ function: "mine", file: "/srv/app/x.ts", inApp: false },
			{ function: "bad", inApp: true },
		]);
		expect(normaliseFrames("x")).toEqual([]);
	});
});
