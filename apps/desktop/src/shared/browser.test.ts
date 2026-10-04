import { describe, expect, it } from "vitest";
import { browserUrl } from "./browser";
describe("browser navigation boundary", () => {
	it.each(["https://example.com/path?q=test", "http://127.0.0.1:3000/", "http://localhost:5173/"])("accepts web and development address %s", value => expect(browserUrl(value)).toBe(value));
	it.each(["javascript:alert(1)", "file:///C:/private", "data:text/html,test", "phaseo://settings", "https://name:secret@example.com", "not a url", "https://example.com/" + "x".repeat(8192)])("rejects unsafe address %s", value => expect(() => browserUrl(value)).toThrow());
});
