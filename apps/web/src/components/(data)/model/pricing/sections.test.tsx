import { NextIntlClientProvider, createTranslator } from "next-intl";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { MeterRateRows } from "./sections";

const locales = ["en-GB", "es-ES", "fr-FR", "de-DE", "pt-BR", "ja", "zh-Hans", "hi", "ar-SA"] as const;
describe("MeterRateRows", () => {
	it.each(locales)("shows translated meter names, prices, units and conditions in %s without an extra heading", (locale) => {
		const messages = Object.fromEntries([["Common", "common"], ["Catalogue", "catalogue"]].map(([namespace, file]) => [namespace, JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages", locale, `${file}.json`), "utf8"))]));
		const t = createTranslator({ locale, messages });
		const html = renderToStaticMarkup(
			<NextIntlClientProvider locale={locale} timeZone="UTC" messages={messages}><MeterRateRows rows={[
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
			]} /></NextIntlClientProvider>,
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
});
