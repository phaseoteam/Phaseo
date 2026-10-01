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

	it("resolves dotted settings sentence IDs as valid next-intl paths", async () => {
		const messages = await getPublicMessages("es-ES");
		const translate = createTranslator({ locale: "es-ES", messages } as never);

		expect(translate("SettingsUI.strings.Please try again." as never)).not.toBe(
			"Please try again.",
		);
		expect(
			translate("SettingsUI.strings.Invalid code. Please try again." as never),
		).not.toBe("Invalid code. Please try again.");
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
