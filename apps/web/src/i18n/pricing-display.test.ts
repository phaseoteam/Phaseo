import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { unitLabel, conciseConditionLabel } from "@/components/(data)/model/pricing/pricingHelpers";
import { localizedPricingDisplayLabel, PRICING_DISPLAY_LABEL_KEYS } from "./pricing-display";

const locales = ["en-GB", "es-ES", "fr-FR", "de-DE", "pt-BR", "ja", "zh-Hans", "hi", "ar-SA"] as const;
describe("generated pricing presentation copy", () => {
	it.each(locales)("translates canonical generated labels in %s", (locale) => {
		const catalogs = Object.fromEntries([["Common", "common"], ["Catalogue", "catalogue"], ["Product", "product"]].map(([namespace, file]) => [namespace, JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages", locale, file + ".json"), "utf8"))]));
		const t = createTranslator({ locale, messages: catalogs });
		for (const key of Object.values(PRICING_DISPLAY_LABEL_KEYS)) expect(t.has(key)).toBe(true);
		const canonical = [
			...Object.keys(PRICING_DISPLAY_LABEL_KEYS),
			...(["token", "pixel", "image", "video", "second", "minute", "page", "call", "character", "byte", "frame", "message", "credit", "usd", "unknown"] as const).flatMap((unit) => [unitLabel(unit, 1), unitLabel(unit, 1000)]),
			conciseConditionLabel([{ op: "eq", path: "cache_ttl", value: "5m" }]),
			conciseConditionLabel([{ op: "eq", path: "cache_ttl", value: "nx" }]),
			"Text Tokens · Cache Reads", "Image Tokens · Input", "Audio Inputs", "5 min TTL", "1 hour TTL", "quality = high", "Video Generation - With audio",
		];
		for (const label of canonical) {
			const display = localizedPricingDisplayLabel(label, locale, t as never);
			expect(display).toBeTruthy();
			expect(display).not.toContain("Common.ui.");
			if (locale !== "en-GB") expect(display).not.toMatch(/\b(?:Per|No cache|With audio|No audio|All usage|Generation|Cache Reads|Inputs|cache TTL)\b/);
		}
		expect(localizedPricingDisplayLabel("custom_meter_id", locale, t as never)).toBe("custom_meter_id");
	});
});
