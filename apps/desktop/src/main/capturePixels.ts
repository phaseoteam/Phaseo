import type { NativeImage } from "electron";

/**
 * A page capture's size in pixels, which is what its PNG has. Up to Electron 45 captures are marked 1x, so `getSize()`
 * is already in pixels; from 46 they carry the page's scale factor and `getSize()` (like `resize()`) is in DIPs.
 */
export function capturePixels(image: Pick<NativeImage, "getSize" | "getScaleFactors">) {
	const size = image.getSize(), scale = image.getScaleFactors()[0] ?? 1;
	return { width: Math.round(size.width * scale), height: Math.round(size.height * scale), scale };
}
