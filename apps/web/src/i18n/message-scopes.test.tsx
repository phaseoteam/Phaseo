import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { useTranslations } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { FeatureMessagesProvider, LocaleMessagesProvider } from "@/components/i18n/LocaleMessagesProvider";
import { getPublicMessages } from "./messages";
import { publicLocales } from "./routing";
import { combineMessages, selectMessages, SHELL_MESSAGE_NAMESPACES } from "./message-scopes";
import lazyScopes from "./lazy-message-scopes.json";
import { gzipSync } from "node:zlib";
import { selectClientMessages } from "./client-message-selection";
import { localizedProviderCatalogMessage } from "./provider-catalog-messages";

function routeNamespaces(directory: string): string[][] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const file = join(directory, entry.name);
		if (entry.isDirectory()) return routeNamespaces(file);
		if (!entry.name.endsWith(".tsx")) return [];
		const source = readFileSync(file, "utf8");
		return [...source.matchAll(/(?:createScopedMessages(?:Layout|Template)\(|namespaces=\{)(\[[^\]]+\])/g)]
			.map((match) => JSON.parse(match[1]) as string[]);
	});
}

const scopes = routeNamespaces(join(process.cwd(), "src/app/[locale]"));

describe("route message selection", () => {
	it.each(publicLocales)("preserves every declared scope in %s", async (locale) => {
		const messages = await getPublicMessages(locale);
		const shell = selectMessages(messages, SHELL_MESSAGE_NAMESPACES);
		for (const scope of scopes) {
			expect(() => selectMessages(messages, scope)).not.toThrow();
			expect(() => selectClientMessages(messages, scope)).not.toThrow();
		}
		expect(shell.Catalogue).toBeUndefined();
		expect(shell.Content).toBeUndefined();
		expect((shell.SettingsUI as Record<string, unknown>).credits).toBeUndefined();
		const onError = jest.fn();
		const combined = combineMessages(shell, selectMessages(messages, ["Catalogue.models"]));
		const translate = createTranslator({ locale, messages: combined, onError } as never);
		expect(translate("Common.nav.home" as never)).toBeTruthy();
		expect(translate("Catalogue.models.title" as never)).toBeTruthy();
		expect(shell.Auth).toEqual({ shared: { changeLanguage: messages.Auth.shared.changeLanguage } });
		expect((shell.Common as Record<string, unknown>).authFlows).toBeUndefined();
		expect((shell.Common as Record<string, Record<string, unknown>>).ui.modelEditor).toBeUndefined();
		const optional = selectMessages(messages, lazyScopes.actionDock);
		const optionalTranslate = createTranslator({ locale, messages: combineMessages(shell, optional), onError } as never);
		expect(optionalTranslate.has("SettingsUI.strings.Details" as never)).toBe(true);
		expect(optionalTranslate.has("SettingsUI.identity.availability.ready" as never)).toBe(true);
		expect(optionalTranslate.has("SettingsUI.identity.reviewStatus.approved" as never)).toBe(true);
		expect(optionalTranslate("Product.internalTools.dataEditor.policyUnknown" as never)).toBeTruthy();
		const optionalSettings = createTranslator({ locale, messages: optional, namespace: "SettingsUI", onError } as never);
		expect(localizedProviderCatalogMessage("Unknown model field.", optionalSettings)).toBeTruthy();
		expect(onError).not.toHaveBeenCalled();
		function TranslatedChild() {
			const shared = useTranslations("Common.nav");
			const feature = useTranslations("Catalogue.models");
			return <p>{shared("home")} {feature("title")}</p>;
		}
		expect(() => renderToStaticMarkup(
			<LocaleMessagesProvider locale={locale} messages={shell} timeZone="UTC">
				<FeatureMessagesProvider messages={selectMessages(messages, ["Catalogue.models"])}>
					<TranslatedChild />
				</FeatureMessagesProvider>
			</LocaleMessagesProvider>,
		)).not.toThrow();
		expect(JSON.stringify(shell).length).toBeLessThan(JSON.stringify(messages).length / 3);
	});

	it("keeps the English homepage client dictionary below 10 KB compressed", async () => {
		const messages = await getPublicMessages("en-GB");
		const [homepage] = routeNamespaces(join(process.cwd(), "src/app/[locale]/(dashboard)")).filter(scope => scope.includes("Site.homeQuickstart"));
		expect(homepage).toBeDefined();
		const selected = combineMessages(selectMessages(messages, SHELL_MESSAGE_NAMESPACES), selectClientMessages(messages, homepage));
		expect(gzipSync(JSON.stringify(selected)).byteLength).toBeLessThan(10_000);
		expect((selected.Site as Record<string, unknown>).home).toBeUndefined();
		expect((selected.SettingsUI as Record<string, unknown>).providerCatalogCopy).toBeUndefined();
	});

	it("merges features without losing shared nested keys or mutating source catalogs", () => {
		const source = { Site: { brandMenu: { title: "Brand" }, home: { title: "Home" } } };
		const before = JSON.stringify(source);
		const shell = selectMessages(source, ["Site.brandMenu"]);
		const feature = selectMessages(source, ["Site.home"]);
		expect(combineMessages(shell, feature)).toEqual(source);
		expect(selectMessages(source, ["Site", "Site.home"])).toEqual(source);
		expect(JSON.stringify(source)).toBe(before);
	});

	it("fails explicitly when a declared namespace is missing", () => {
		expect(() => selectMessages({}, ["Site.home"])).toThrow("Site.home");
	});

	it("rejects stale generated boundaries instead of sending an entire catalog", () => {
		expect(() => selectClientMessages({}, ["Unregistered.feature"])).toThrow("Missing generated client message scope");
	});

	it("preserves FAQ raw arrays when selecting numeric translation paths", async () => {
		const messages = await getPublicMessages("en-GB");
		const [faq] = scopes.filter(scope => scope.includes("Site.faq"));
		const selected = selectClientMessages(messages, faq);
		expect((selected.Site as Record<string, Record<string, unknown>>).faq.items).toEqual(messages.Site.faq.items);
	});
});
