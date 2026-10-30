/**
 * A PNG's width and height in pixels, read from its IHDR chunk. Up to Electron 45 a page capture's `getSize()` gives
 * the same; from 46 captures carry the page's scale factor and `getSize()` is in whole DIPs, which can't be turned back
 * into pixels exactly at fractional scales (a 1252-pixel capture at 1.25× reports 1001).
 */
export function pngPixels(png: Buffer) {
	if (png.length < 24 || png.toString("latin1", 12, 16) !== "IHDR") return { width: 0, height: 0 };
	return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
