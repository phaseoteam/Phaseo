import { createTranslator } from "next-intl";
import fs from "node:fs";
import path from "node:path";
import { localizedProviderCatalogMessage, localizedProviderEvent } from "./provider-catalog-messages";
import englishMessages from "../../messages/en-GB/settings-ui.json";

const locales = ["es-ES", "fr-FR", "de-DE", "pt-BR", "ja", "zh-Hans", "hi", "ar-SA"] as const;
const translator = (locale: typeof locales[number]) => createTranslator({ locale, messages: JSON.parse(fs.readFileSync(path.join(__dirname, "../../messages", locale, "settings-ui.json"), "utf8")) as typeof englishMessages });

describe("provider catalog messages", () => {
	it.each(locales)("translates all current validator messages in %s", locale => {
		const t = translator(locale);
		const source = fs.readFileSync(path.resolve(__dirname, "../../../web-api/src/routes/account/provider-catalog.ts"), "utf8");
		const staticMessages = [...source.matchAll(/issues\.push\(\{[^\n]*?message: "([^"]+)"/g)].map(match => match[1]);
		expect(staticMessages.length).toBeGreaterThan(15);
		for (const message of staticMessages) {
			const translated = localizedProviderCatalogMessage(message, t);
			expect(translated).not.toBe(message);
			expect(translated).not.toBe(t("identity.catalogValidation.fallback"));
		}
		for (const message of ["Duplicate pricing meter: output.text.", "Unknown pricing meter: example.meter.", "Duplicate model id: openai/gpt-5.", "Catalog contains 300 models; the limit is 200.", "Model strings must not exceed 4096 characters."]) {
			expect(localizedProviderCatalogMessage(message, t)).not.toBe(t("identity.catalogValidation.fallback"));
		}
		expect(localizedProviderCatalogMessage("Duplicate model id: openai/gpt-5.", t)).toContain("openai/gpt-5");
	});

	it.each(locales)("translates new and historic events while preserving review reasons in %s", locale => {
		const t = translator(locale);
		const event = { event_type: "catalog_applied", title: "Catalog synced", message: "3 model claims were approved automatically; 2 new models need review.", payload: {} };
		const historic = localizedProviderEvent(event, t);
		expect(historic.title).not.toBe(event.title);
		expect(historic.message).toContain("3");
		expect(historic.message).toContain("2");
		expect(localizedProviderEvent({ ...event, message: "", payload: { approved: 3, pending: 2 } }, t)).toEqual(historic);
		const reason = "Please contact our security team.";
		const reviewed = localizedProviderEvent({ event_type: "model_rejected", title: "Model rejected", message: `openai/gpt-5: ${reason}`, payload: {} }, t);
		expect(reviewed.message).toBe(`openai/gpt-5: ${reason}`);
		expect(reviewed.title).not.toBe("Model rejected");
		const claim = localizedProviderEvent({ event_type: "provider_application_reviewed", title: "Provider claim approved", message: "", payload: { decision: "approved" } }, t);
		expect(claim.message).toBe(t("identity.events.claimApproved"));
	});
});
