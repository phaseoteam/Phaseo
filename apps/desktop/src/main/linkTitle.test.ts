import { expect, it } from "vitest";
import { linkTitle, publicTitleAddress, titleFromHtml } from "./linkTitle";

it("excludes local, private, shared and multicast addresses from automatic previews", () => {
	for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.2.3", "192.168.0.1", "169.254.169.254", "100.64.0.1", "224.0.0.1"]) expect(publicTitleAddress(ip)).toBe(false);
	expect(publicTitleAddress("8.8.8.8")).toBe(true);
});
it("extracts readable bounded titles and quietly skips unsupported URLs", async () => {
	expect(titleFromHtml('<title> Example &amp;\n docs </title>')).toBe("Example & docs");
	expect(titleFromHtml("<p>No title</p>")).toBeUndefined();
	expect(await linkTitle("http://localhost/private")).toBeUndefined();
	expect(await linkTitle("https://user:password@example.com")).toBeUndefined();
});
