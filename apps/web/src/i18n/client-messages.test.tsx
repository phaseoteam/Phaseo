import { renderToStaticMarkup } from "react-dom/server";
import { useTranslations } from "next-intl";
import { ClientMessagesProvider, FeatureMessagesProvider } from "@/components/i18n/LocaleMessagesProvider";
import { allClientMessageScopes, clientMessagesFile, clientMessagesScopeId, selectScopeMessages } from "./client-message-files";
import { clientMessagesFallbackUrl, clientMessagesUrl } from "./client-message-source";
import { resolveClientMessages } from "./client-messages";
import { getPublicMessages } from "./messages";
import { publicLocales } from "./routing";

// The model page boundary: the largest public route scope.
const MODEL_SCOPE = allClientMessageScopes().find((scope) => scope !== "shell" && scope.includes("Catalogue.catalogNotFound")) as readonly string[];

describe("client dictionaries", () => {
	it.each(publicLocales)("resolves the shell and every route scope in %s", async (locale) => {
		const messages = await getPublicMessages(locale) as Record<string, unknown>;
		for (const scope of allClientMessageScopes()) {
			expect(() => selectScopeMessages(messages, scope)).not.toThrow();
		}
	});

	it("gives every scope its own id", () => {
		const ids = allClientMessageScopes().map(clientMessagesScopeId);
		expect(ids[0]).toBe("shell");
		expect(new Set(ids).size).toBe(ids.length);
		expect(clientMessagesScopeId([...MODEL_SCOPE].reverse())).toBe(clientMessagesScopeId(MODEL_SCOPE));
	});

	it("names each file by its content", async () => {
		const messages = await getPublicMessages("de-DE") as Record<string, unknown>;
		const shell = clientMessagesFile("de-DE", selectScopeMessages(messages, "shell"));
		expect(clientMessagesFile("de-DE", selectScopeMessages(messages, "shell"))).toEqual(shell);
		expect(shell.key).toMatch(/^de-DE\/[0-9a-f]{16}$/);
		expect(clientMessagesFile("de-DE", { ...JSON.parse(shell.json), extra: "copy" }).key).not.toBe(shell.key);
	});

	it("hands providers a reference whose file and fallback URLs name the scope", async () => {
		const source = await resolveClientMessages("zh-Hans", MODEL_SCOPE);
		expect(source.scope).toBe(clientMessagesScopeId(MODEL_SCOPE));
		expect(clientMessagesUrl(source)).toBe(`/_i18n/${source.key}.json`);
		expect(clientMessagesFallbackUrl(source)).toBe(`/api/i18n/scope/zh-Hans/${source.scope}`);
		expect(JSON.stringify(source).length).toBeLessThan(80);
	});

	it("renders the copy prepared on the server while the props carry only references", async () => {
		const messages = await getPublicMessages("fr-FR");
		const [catalogueKey, catalogueText] = Object.entries(messages.Catalogue.catalogNotFound)
			.find(([, value]) => typeof value === "string") as [string, string];
		function Labels() {
			const nav = useTranslations("Common.nav");
			const catalogue = useTranslations("Catalogue.catalogNotFound");
			return <p>{nav("models")} · {catalogue(catalogueKey as never)}</p>;
		}
		const shell = await resolveClientMessages("fr-FR", "shell");
		const model = await resolveClientMessages("fr-FR", MODEL_SCOPE);
		const html = renderToStaticMarkup(
			<ClientMessagesProvider locale="fr-FR" source={shell} timeZone="UTC">
				<FeatureMessagesProvider source={model}>
					<Labels />
				</FeatureMessagesProvider>
			</ClientMessagesProvider>,
		);
		expect(html).toContain(messages.Common.nav.models);
		expect(html).toContain(catalogueText.replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
	});
});
