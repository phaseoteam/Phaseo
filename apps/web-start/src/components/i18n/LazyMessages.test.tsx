import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { LazyMessages } from "./LazyMessages";
import { LocaleMessagesProvider } from "./LocaleMessagesProvider";
import { getPublicMessages } from "@/i18n/messages";
import { selectMessages, SHELL_MESSAGE_NAMESPACES } from "@/i18n/message-scopes";
import scopes from "@/i18n/lazy-message-scopes.json";

function ToolLabel() {
	const t = useTranslations("SettingsUI.identity.availability");
	return <span>{t("ready")}</span>;
}

describe("optional translation loading", () => {
	it("does not render a tool before its translations are loaded", async () => {
		const messages = await getPublicMessages("es-ES");
		const client = new QueryClient();
		expect(renderToStaticMarkup(
			<LocaleMessagesProvider locale="es-ES" messages={selectMessages(messages, SHELL_MESSAGE_NAMESPACES)} timeZone="UTC">
				<QueryClientProvider client={client}><LazyMessages feature="actionDock"><ToolLabel /></LazyMessages></QueryClientProvider>
			</LocaleMessagesProvider>,
		)).toBe("");
		client.clear();
	});

	it("renders optional copy in the active locale and inherits shared messages", async () => {
		const messages = await getPublicMessages("ar-SA");
		const client = new QueryClient();
		client.setQueryData(["lazyMessages", "ar-SA", "actionDock"], selectMessages(messages, scopes.actionDock));
		const html = renderToStaticMarkup(
			<LocaleMessagesProvider locale="ar-SA" messages={selectMessages(messages, SHELL_MESSAGE_NAMESPACES)} timeZone="UTC">
				<QueryClientProvider client={client}><LazyMessages feature="actionDock"><ToolLabel /></LazyMessages></QueryClientProvider>
			</LocaleMessagesProvider>,
		);
		expect(html).toContain(messages.SettingsUI.identity.availability.ready);
		client.clear();
	});
});
