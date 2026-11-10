import { describe, expect, it } from "vitest";
import {
	getMobilePriceCellClass,
	getMobilePriceColumnKeys,
} from "@/components/(data)/model/pricing/providerTableMobile";
import type { ProviderTablePriceColumn } from "@/components/(data)/model/pricing/pricingHelpers";

type Column = Pick<ProviderTablePriceColumn, "key" | "direction" | "modality">;
const col = (direction: Column["direction"], modality: Column["modality"], unit = "1M"): Column => ({
	key: `${direction}:${modality}:${unit}`,
	direction,
	modality,
});

describe("getMobilePriceColumnKeys", () => {
	it("gives text models input, output and cache read, leaving cache writes out", () => {
		const columns = [col("input", "text"), col("output", "text"), col("cached", "text"), col("cachewrite", "text")];
		expect(getMobilePriceColumnKeys(columns)).toEqual(["input:text:1M", "output:text:1M", "cached:text:1M"]);
	});

	it("leads with the media output for video models", () => {
		const columns = [col("input", "text"), col("output", "text"), col("output", "video", "video")];
		expect(getMobilePriceColumnKeys(columns)).toEqual(["output:video:video", "input:text:1M", "output:text:1M"]);
	});

	it("keeps image models to three prices with the image output first", () => {
		const columns = [col("input", "text"), col("cached", "text"), col("input", "image"), col("output", "image")];
		expect(getMobilePriceColumnKeys(columns)).toEqual(["output:image:1M", "input:text:1M", "cached:text:1M"]);
	});

	it("shows whatever a single-price model has", () => {
		expect(getMobilePriceColumnKeys([col("input", "audio", "min")])).toEqual(["input:audio:min"]);
	});

	it("falls back to cache writes only when nothing else is left", () => {
		const columns = [col("input", "text"), col("cachewrite", "text")];
		expect(getMobilePriceColumnKeys(columns)).toEqual(["input:text:1M", "cachewrite:text:1M"]);
	});
});

describe("getMobilePriceCellClass", () => {
	it("orders picked prices and hides the rest on phones", () => {
		const keys = ["b", "a"];
		expect(getMobilePriceCellClass(keys, "b")).toBe("max-sm:order-1");
		expect(getMobilePriceCellClass(keys, "a")).toBe("max-sm:order-2");
		expect(getMobilePriceCellClass(keys, "c")).toBe("max-sm:hidden");
	});
});
