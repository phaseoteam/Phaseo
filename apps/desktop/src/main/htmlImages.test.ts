import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { embedLocalImages } from "./htmlImages";

it("embeds local images a page names by path, and leaves web and missing ones alone", async () => {
	const folder = mkdtempSync(path.join(tmpdir(), "phaseo-html-images-"));
	try {
		writeFileSync(path.join(folder, "chart.png"), Buffer.from([137, 80, 78, 71]));
		writeFileSync(path.join(folder, "notes.txt"), "not an image");
		const absolute = path.join(folder, "chart.png");
		const page = `<img src="chart.png"><img src='${pathToFileURL(absolute).href}'><img src="${absolute}"><img src="https://example.com/a.png"><img src="missing.png"><img src="notes.txt">`;
		const result = await embedLocalImages(page, folder);
		expect(result.embedded).toBe(3);
		expect(result.missing).toEqual(["missing.png", "notes.txt"]);
		expect(result.html.match(/data:image\/png;base64,iVBORw==/g)).toHaveLength(3);
		expect(result.html).toContain(`src="https://example.com/a.png"`);
		expect(await embedLocalImages("<p>No images</p>", folder)).toEqual({ html: "<p>No images</p>", embedded: 0, missing: [] });
	} finally { rmSync(folder, { recursive: true, force: true }); }
});
