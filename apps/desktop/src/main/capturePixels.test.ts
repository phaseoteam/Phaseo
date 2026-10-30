import { describe, expect, it } from "vitest";
import { pngPixels } from "./capturePixels";

const png = (width: number, height: number) => {
	const header = Buffer.alloc(24);
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
	header.writeUInt32BE(13, 8); header.write("IHDR", 12, "latin1"); header.writeUInt32BE(width, 16); header.writeUInt32BE(height, 20);
	return header;
};

describe("pngPixels", () => {
	it("reads the pixel size a capture's PNG has, even where whole DIPs at a fractional scale would lose a pixel", () => {
		expect(pngPixels(png(1252, 835))).toEqual({ width: 1252, height: 835 });
	});
	it("reports nothing for bytes that aren't a PNG", () => {
		expect(pngPixels(Buffer.alloc(0))).toEqual({ width: 0, height: 0 });
		expect(pngPixels(Buffer.alloc(24))).toEqual({ width: 0, height: 0 });
	});
});
