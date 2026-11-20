import { describe, it, expect } from "vitest";
import { AppIntlProvider, createTranslator } from "@/i18n/react";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { CacheWriteSection, MeterRateRows } from "./sections";
import { buildProviderSections } from "./pricingHelpers";
import { localizedPricingDisplayLabel } from "@/i18n/pricing-display";

const locales = ["en-GB", "es-ES", "fr-FR", "de-DE", "pt-BR", "ja", "zh-Hans", "hi", "ar-SA"] as const;
describe("CacheWriteSection", () => {
	it("renders all four Haiku prompt-length and TTL prices", () => {
		const locale = "en-GB";
		const messages = Object.fromEntries([["Common", "common"], ["Catalogue", "catalogue"]].map(([namespace, file]) => [namespace, JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages", locale, `${file}.json`), "utf8"))]));
		const t = createTranslator({ locale, messages });
		const rows = [
			{ per1M: 0.125, label: "5 min TTL · ≤ 100k input tokens" },
			{ per1M: 0.2, label: "1 hour TTL · ≤ 100k input tokens" },
			{ per1M: 0.625, label: "5 min TTL · > 100k input tokens" },
			{ per1M: 1, label: "1 hour TTL · > 100k input tokens" },
		].map((row) => ({ ...row, price: row.per1M, isCurrent: true }));
		const html = renderToStaticMarkup(
			<AppIntlProvider locale={locale} timeZone="UTC" messages={messages}><CacheWriteSection rows={rows} /></AppIntlProvider>,
		);
		for (const row of rows) {
			expect(html).toContain(`$${row.per1M.toFixed(3)}`);
			expect(html).toContain(localizedPricingDisplayLabel(row.label, locale, t as never).replace(/>/g, "&gt;"));
		}
	});
});

describe("MeterRateRows", () => {
	it.each(locales)("shows translated meter names, prices, units and conditions in %s without an extra heading", (locale) => {
		const messages = Object.fromEntries([["Common", "common"], ["Catalogue", "catalogue"]].map(([namespace, file]) => [namespace, JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages", locale, `${file}.json`), "utf8"))]));
		const t = createTranslator({ locale, messages });
		const html = renderToStaticMarkup(
			<AppIntlProvider locale={locale} timeZone="UTC" messages={messages}><MeterRateRows rows={[
				{
					meter: "audio_minutes",
					displayLabel: "Audio minutes",
					unit: "minute",
					unitQuantity: 1,
					unitLabel: "Per minute",
					price: 0.08,
				},
				{
					meter: "input_text_messages",
					unit: "message",
					unitQuantity: 1,
					unitLabel: "Per message",
					price: 0.004,
					conditions: [{ path: "request.quality", op: "eq", value: "high" }],
				},
			]} /></AppIntlProvider>,
		);

		expect(html).toContain(t("Catalogue.modelDetail.pricing.meters.audio_minutes" as never));
		expect(html).not.toContain("MISSING_MESSAGE");
		expect(html).not.toContain("Common.ui.");
		expect(html).toContain(t("Catalogue.modelDetail.pricing.meters.input_text_messages" as never));
		expect(html).not.toContain("Catalogue.");
		expect(html).toContain("request.quality:");
		expect(html).toContain(t("Common.ui.requestBuilder.high" as never));
		expect(html).not.toContain("Usage rates");
	});

	it.each(locales)("names GPT Live's active and standby session rates in %s", (locale) => {
		const messages = Object.fromEntries([["Common", "common"], ["Catalogue", "catalogue"]].map(([namespace, file]) => [namespace, JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages", locale, `${file}.json`), "utf8"))]));
		const t = createTranslator({ locale, messages });
		const row = { unit: "minute" as const, unitQuantity: 1, unitLabel: "Per minute" };
		const html = renderToStaticMarkup(
			<AppIntlProvider locale={locale} timeZone="UTC" messages={messages}><MeterRateRows rows={[
				{ ...row, meter: "audio_minutes", price: 0.05 },
				{ ...row, meter: "standby_audio_minutes", price: 0.02 },
			]} /></AppIntlProvider>,
		);

		expect(html).toContain(t("Catalogue.modelDetail.pricing.meters.active_audio_minutes" as never));
		expect(html).toContain(t("Catalogue.modelDetail.pricing.meters.standby_audio_minutes" as never));
		expect(html).not.toContain(t("Catalogue.modelDetail.pricing.meters.audio_minutes" as never));
		expect(html).toContain("$0.05");
		expect(html).toContain("$0.02");
		if (locale === "en-GB") {
			expect(html).toContain("Active session");
			expect(html).toContain("Standby session");
		}
	});

	it("renders GPT Live's catalogue SKU rows as active then standby session rates", () => {
		const locale = "en-GB";
		const messages = Object.fromEntries([["Common", "common"], ["Catalogue", "catalogue"]].map(([namespace, file]) => [namespace, JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages", locale, `${file}.json`), "utf8"))]));
		const model = { id: "openai:openai/gpt-live-1:audio.realtime", api_provider_id: "openai", model_id: "openai/gpt-live-1",
			endpoint: "audio.realtime", capability_status: "active", is_active_gateway: true, input_modalities: "text,audio", output_modalities: "text,audio" };
		const rule = { model_key: model.id, pricing_plan: "standard", unit: "minute", unit_size: 1, currency: "USD", match: [],
			effective_from: "2026-11-19T20:10:22.712Z", effective_to: null, note: null };
		// The audio.realtime SKU rows as the catalogue holds them (2026-11-19).
		const sections = buildProviderSections({ provider: { api_provider_id: "openai", api_provider_name: "OpenAI" }, provider_models: [model],
			pricing_rules: [{ ...rule, id: "live-standby", meter: "standby_audio_minutes", price_per_unit: 0.02, priority: 20 },
				{ ...rule, id: "live-active", meter: "audio_minutes", price_per_unit: 0.05, priority: 10 }] } as never, "standard");
		const html = renderToStaticMarkup(
			<AppIntlProvider locale={locale} timeZone="UTC" messages={messages}><MeterRateRows rows={sections.otherRules} /></AppIntlProvider>,
		);
		const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
		expect(text).toMatch(/^Active session \$0\.05 Per 1 minute Standby session \$0\.02 Per 1 minute$/);
	});
});
