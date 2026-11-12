import { describe, expect, it } from "vitest";
import { clampZoom, zoomAround } from "./ImageViewer";

describe("image zoom", () => {
	it("keeps the point under the pointer still and resets at fit", () => {
		expect(zoomAround(1, { x: 0, y: 0 }, 2, { x: 100, y: -50 })).toEqual({ zoom: 2, offset: { x: -100, y: 50 } });
		expect(zoomAround(2, { x: -100, y: 50 }, 0.5, { x: 0, y: 0 })).toEqual({ zoom: 1, offset: { x: 0, y: 0 } });
		expect(clampZoom(20)).toBe(8);
	});
});
