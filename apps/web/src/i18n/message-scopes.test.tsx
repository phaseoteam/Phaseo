import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { useTranslations } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { FeatureMessagesProvider, LocaleMessagesProvider } from "@/components/i18n/LocaleMessagesProvider";
import { getPublicMessages } from "./messages";
import { publicLocales } from "./routing";
import { combineMessages, selectMessages, SHELL_MESSAGE_NAMESPACES } from "./message-scopes";

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
		for (const scope of scopes) expect(() => selectMessages(messages, scope)).not.toThrow();
		expect(shell.Catalogue).toBeUndefined();
		expect(shell.Content).toBeUndefined();
		expect((shell.SettingsUI as Record<string, unknown>).credits).toBeUndefined();
		const onError = jest.fn();
		const combined = combineMessages(shell, selectMessages(messages, ["Catalogue.models"]));
		const translate = createTranslator({ locale, messages: combined, onError } as never);
		expect(translate("Common.nav.home" as never)).toBeTruthy();
		expect(translate("Catalogue.models.title" as never)).toBeTruthy();
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
});
