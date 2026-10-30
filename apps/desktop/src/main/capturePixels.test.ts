import { describe, expect, it } from "vitest";
import { capturePixels } from "./capturePixels";

const image = (width: number, height: number, scales: number[]) => ({ getSize: () => ({ width, height }), getScaleFactors: () => scales });

describe("capturePixels", () => {
	it("keeps a 1x capture's size, as Electron 45 reports it", () => {
		expect(capturePixels(image(1440, 900, [1]))).toEqual({ width: 1440, height: 900, scale: 1 });
	});
	it("turns a HiDPI capture's DIPs into pixels, as Electron 46 reports it", () => {
		expect(capturePixels(image(720, 450, [2]))).toEqual({ width: 1440, height: 900, scale: 2 });
		expect(capturePixels(image(1001, 667, [1.5]))).toEqual({ width: 1502, height: 1001, scale: 1.5 });
	});
	it("treats an image without representations as 1x", () => {
		expect(capturePixels(image(0, 0, []))).toEqual({ width: 0, height: 0, scale: 1 });
	});
});
