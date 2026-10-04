import { describe, expect, it } from "vitest";
import { browserUrl, browserViewport } from "./browser";
describe("browser navigation boundary", () => {
	it.each(["https://example.com/path?q=test", "http://127.0.0.1:3000/", "http://localhost:5173/"])("accepts web and development address %s", value => expect(browserUrl(value)).toBe(value));
	it.each(["javascript:alert(1)", "file:///C:/private", "data:text/html,test", "phaseo://settings", "https://name:secret@example.com", "not a url", "https://example.com/" + "x".repeat(8192)])("rejects unsafe address %s", value => expect(() => browserUrl(value)).toThrow());
});

describe("browser device preview modes", () => {
 it.each(["desktop","phone","phone-landscape","tablet","tablet-landscape"])("accepts supported mode %s", value => expect(browserViewport(value)).toBe(value));
 it.each([undefined,null,{},"unknown","",42])("rejects malformed mode %j", value => expect(()=>browserViewport(value)).toThrow("Invalid browser viewport"));
});
