import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { snapshotScript, targetScript } from "./browserAgent";
import { overlayControllerScript, overlayCursorScript, overlayZoomScript } from "./browserOverlay";

type FakeElement = { tagName: string; type?: string; id?: string; value?: string; checked?: boolean; disabled?: boolean; isContentEditable?: boolean; innerText?: string; attributes?: Record<string, string>; parentElement?: FakeElement | null; nodeType: 1; rect?: { left: number; top: number; width: number; height: number } };
/** Just enough DOM to run the agent's page scripts: selectors map to fixed elements. */
function page(matches: Record<string, FakeElement[]>, all: FakeElement[] = [], text = "") {
	const decorate = (element: FakeElement) => Object.assign(element, {
		getAttribute: (name: string) => element.attributes?.[name] ?? null, scrollIntoView: () => undefined, focus: () => undefined,
		getBoundingClientRect: () => element.rect ?? { left: 10, top: 20, width: 100, height: 40 }, parentElement: element.parentElement ?? null, labels: [],
	});
	for (const element of [...Object.values(matches).flat(), ...all]) decorate(element);
	const document = {
		documentElement: { tagName: "HTML", nodeType: 1 }, body: { innerText: text },
		querySelectorAll: (selector: string) => { if (selector === "!!") throw new SyntaxError("bad"); if (selector.startsWith("a[href],button")) return all; return matches[selector] ?? []; },
	};
	return { document, CSS: { escape: (value: string) => value }, getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }), requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), setTimeout, getSelection: () => undefined };
}
const run = (code: string, context: object) => runInNewContext(code, context) as unknown;

describe("agent page scripts", () => {
	it("finds the one element a selector matches and returns its centre", async () => {
		const input: FakeElement = { tagName: "INPUT", type: "text", nodeType: 1, rect: { left: 10, top: 20, width: 100, height: 40 } };
		expect(await run(targetScript("#q"), page({ "#q": [input] }))).toEqual({ x: 60, y: 40, editable: true });
		const button: FakeElement = { tagName: "BUTTON", nodeType: 1 };
		expect(await run(targetScript("button"), page({ button: [button] }))).toMatchObject({ editable: false });
	});
	it("explains a selector that matches nothing, several elements, or is not CSS", async () => {
		expect(await run(targetScript("#missing"), page({}))).toMatchObject({ error: expect.stringContaining("No element matches") });
		const item = (): FakeElement => ({ tagName: "LI", nodeType: 1 });
		expect(await run(targetScript("li"), page({ li: [item(), item()] }))).toMatchObject({ error: expect.stringContaining("2 elements match") });
		expect(await run(targetScript("!!"), page({}))).toMatchObject({ error: "That selector is not valid CSS." });
		expect(await run(targetScript("#off"), page({ "#off": [{ tagName: "DIV", nodeType: 1, rect: { left: 0, top: 0, width: 0, height: 0 } }] }))).toMatchObject({ error: "That element is not visible." });
		expect(await run(targetScript("#x"), page({ "#x": [{ tagName: "BUTTON", nodeType: 1, disabled: true }] }))).toMatchObject({ error: "That element is disabled." });
	});
	it("keeps selectors from an agent as data, never code", async () => {
		const hostile = "\"); globalThis.hacked = true; (\"";
		const context = { ...page({}), hacked: false };
		await run(targetScript(hostile), context);
		expect(context.hacked).toBe(false);
		expect(targetScript(hostile)).toContain(JSON.stringify(hostile));
	});
	it("reads text and elements, never password values", () => {
		const password: FakeElement = { tagName: "INPUT", type: "password", value: "hunter2", id: "pw", nodeType: 1, attributes: { "aria-label": "Password" } };
		const email: FakeElement = { tagName: "INPUT", type: "email", value: "a@b.test", id: "email", nodeType: 1, attributes: { placeholder: "Email" } };
		const link: FakeElement = { tagName: "A", innerText: "  Docs\n home ", id: "docs", nodeType: 1 };
		const result = run(snapshotScript(12, 300), page({ "#pw": [password], "#email": [email], "#docs": [link] }, [password, email, link], "Welcome back\n\n\n\nSign in please")) as { text: string; truncated: boolean; elements: unknown[] };
		expect(result.text).toBe("Welcome back");
		expect(result.truncated).toBe(true);
		expect(result.elements).toEqual([
			{ selector: "#pw", role: "textbox", name: "Password", tag: "input" },
			{ selector: "#email", role: "textbox", name: "Email", tag: "input", value: "a@b.test" },
			{ selector: "#docs", role: "link", name: "Docs home", tag: "a" },
		]);
		expect(JSON.stringify(result)).not.toContain("hunter2");
	});
	it("builds overlay calls from numbers and quoted names only", () => {
		expect(overlayCursorScript(Number.NaN, 4, "click", 2)).toMatch(/\.cursor\(0, 4, "click", 2\)$/);
		expect(overlayZoomScript(1.25)).toMatch(/\.zoom\(1\.25\)$/);
		const hostile = "human\"); x(\"";
		expect(overlayControllerScript(hostile)).toBe(`window.__phaseoOverlay?.controller(${JSON.stringify(hostile)})`);
	});
});
