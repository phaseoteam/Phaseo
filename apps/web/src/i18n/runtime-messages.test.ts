import { getPublicMessages } from "./messages";
import { createTranslator } from "next-intl";
import { publicLocales, type PublicLocale } from "./routing";
import { getSettingsMessages } from "./settings";
import { getProfileMessages } from "./profile";
import { getPaymentMethodsMessages } from "./payment-methods";
import { getRedeemMessages } from "./redeem";
import { getBetaMessages } from "./beta";
import { getSubscriptionPlansMessages } from "./subscription-plans";

function valueAt(value: unknown, path: string): string {
	let current = value as Record<string, unknown>;
	for (const segment of path.split(".")) current = current[segment] as Record<string, unknown>;
	return current as unknown as string;
}

describe("runtime locale message loading", () => {
	it.each(publicLocales)("loads complete domain trees for %s", async (locale: PublicLocale) => {
		const messages = await getPublicMessages(locale);
		const onError = jest.fn();
		const translate = createTranslator({ locale, messages, onError } as never);
		expect(translate("Common.nav.home" as never)).toBe(valueAt(messages.Common, "nav.home"));
		expect(onError).not.toHaveBeenCalled();
		expect(valueAt(messages.Common, "nav.home")).toBeTruthy();
		expect(valueAt(messages.Site, "home.title")).toBeTruthy();
		expect(valueAt(messages.Catalogue, "models.title")).toBeTruthy();
		expect(valueAt(messages.Content, "help.title")).toBeTruthy();
		expect(valueAt(messages.Product, "tools.title")).toBeTruthy();
		expect(valueAt(messages.SettingsUI, "headers.settings")).toBeTruthy();
	});

	it.each(publicLocales.filter((locale) => locale !== "en-GB"))(
		"does not use the source SettingsUI tree for %s",
		async (locale: PublicLocale) => {
			const source = await getPublicMessages("en-GB");
			const localized = await getPublicMessages(locale);
			const localizedSentinel = valueAt(localized.SettingsUI, "routingStudio.modelCatalogueError");
			const sourceSentinel = valueAt(source.SettingsUI, "routingStudio.modelCatalogueError");
			expect(localizedSentinel).toBeTruthy();
			if (locale === "en-US") expect(localizedSentinel).not.toBe(sourceSentinel);
			else expect(localizedSentinel).not.toBe(sourceSentinel);
		},
	);

	it("resolves settings sentences through stable next-intl IDs", async () => {
		const messages = await getPublicMessages("es-ES");
		const onError = jest.fn();
		const translate = createTranslator({ locale: "es-ES", messages, onError } as never);

		expect(translate("SettingsUI.strings.phrasePleaseTryAgain" as never)).toBe(
			"Por favor inténtalo de nuevo.",
		);
		expect(
			translate("SettingsUI.strings.phraseInvalidCodePleaseTryAgain" as never),
		).toBe("Código no válido. Por favor inténtalo de nuevo.");
		expect(onError).not.toHaveBeenCalled();
	});

	it("uses the en-GB help tree for en-US while localized trees remain available", async () => {
		const [source, us] = await Promise.all([
			import("@/lib/content/helpCenter").then(({ getLocalizedHelpCategories }) => getLocalizedHelpCategories("en-GB")),
			import("@/lib/content/helpCenter").then(({ getLocalizedHelpCategories }) => getLocalizedHelpCategories("en-US")),
		]);
		expect(us).toEqual(source);
	});

	it.each(publicLocales)("loads utility catalogs for %s", (locale: PublicLocale) => {
		expect(getSettingsMessages(locale).sidebar.settings).toBeTruthy();
		expect(getProfileMessages(locale).usageSummary).toBeTruthy();
		expect(getPaymentMethodsMessages(locale).title).toBeTruthy();
		expect(getRedeemMessages(locale).title).toBeTruthy();
		expect(getBetaMessages(locale).title).toBeTruthy();
		expect(getSubscriptionPlansMessages(locale).title).toBeTruthy();
	});
});
