import { describe, expect, it } from "vitest";
import { redirectableTarget, typedCharacter } from "./composerFocusRedirect";

const key = (value: string, extra: Partial<KeyboardEvent> = {}) => ({ key: value, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false, ...extra });
const element = (...matches: string[]) => ({ closest: (selector: string) => matches.some(match => selector.split(", ").includes(match)) ? {} : null });

describe("typedCharacter", () => {
	it("takes one printable character, shifted or not", () => {
		expect(typedCharacter(key("a"))).toBe("a");
		expect(typedCharacter(key("?", { shiftKey: true } as Partial<KeyboardEvent>))).toBe("?");
	});
	it("leaves shortcuts, named keys, space and composition alone", () => {
		expect(typedCharacter(key("k", { ctrlKey: true }))).toBeUndefined();
		expect(typedCharacter(key("k", { metaKey: true }))).toBeUndefined();
		expect(typedCharacter(key("k", { altKey: true }))).toBeUndefined();
		expect(typedCharacter(key("Enter"))).toBeUndefined();
		expect(typedCharacter(key(" "))).toBeUndefined();
		expect(typedCharacter(key("a", { isComposing: true }))).toBeUndefined();
		expect(typedCharacter(key("a", { defaultPrevented: true }))).toBeUndefined();
	});
});

describe("redirectableTarget", () => {
	it("takes input aimed at the page or the conversation", () => {
		expect(redirectableTarget(null, false)).toBe(true);
		expect(redirectableTarget(element(), false)).toBe(true);
	});
	it("leaves fields, terminals, controls and open popups alone", () => {
		expect(redirectableTarget(element("textarea"), false)).toBe(false);
		expect(redirectableTarget(element(".xterm"), false)).toBe(false);
		expect(redirectableTarget(element("button"), false)).toBe(false);
		expect(redirectableTarget(element(), true)).toBe(false);
	});
});
