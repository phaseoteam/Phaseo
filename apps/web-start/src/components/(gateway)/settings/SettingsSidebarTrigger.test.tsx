import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { getPublicMessages } from "@/i18n/messages";
import { getSettingsMessages } from "@/i18n/settings";
import { publicLocales } from "@/i18n/routing";
import { selectMessages, SHELL_MESSAGE_NAMESPACES } from "@/i18n/message-scopes";
import SettingsSidebarTrigger from "./SettingsSidebarTrigger";
import { getSettingsNavigationCopy } from "./Sidebar.labels";

// Expose the hydrated, open sheet contents during a deterministic server render.
jest.mock("react", () => ({ ...jest.requireActual("react"), useSyncExternalStore: () => true }));
jest.mock("@/i18n/navigation", () => ({
    usePathname: () => "/settings/account/details",
    Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
jest.mock("@/components/ui/sheet", () => {
    const React = jest.requireActual("react");
    const content = ({ children }: { children: React.ReactNode }) => React.createElement("div", {}, children);
    return Object.fromEntries(["Sheet", "SheetClose", "SheetContent", "SheetDescription", "SheetHeader", "SheetTitle", "SheetTrigger"].map(name => [name, content]));
});
jest.mock("@/components/ui/scroll-area", () => ({ ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock("@/components/ui/collapsible", () => {
    const React = jest.requireActual("react");
    const content = ({ children }: { children: React.ReactNode }) => React.createElement("div", {}, children);
    return { Collapsible: content, CollapsibleContent: content, CollapsibleTrigger: content };
});

it.each(publicLocales)("renders the settings side sheet with only shared messages in %s", async (locale) => {
    const messages = await getPublicMessages(locale);
    const copy = getSettingsNavigationCopy(getSettingsMessages(locale), messages.SettingsUI.sidebarNew);
    const onError = jest.fn();
    const html = renderToStaticMarkup(
        <NextIntlClientProvider locale={locale} timeZone="UTC" messages={selectMessages(messages, SHELL_MESSAGE_NAMESPACES)} onError={onError}>
            <SettingsSidebarTrigger copy={copy} />
        </NextIntlClientProvider>,
    );
    // Header sheets cannot rely on the settings page's nested provider.
    expect(html).not.toContain("SettingsUI.");
    expect(onError).not.toHaveBeenCalled();
    expect(html).toContain(copy.labels.Preferences);
    expect(html).toContain(copy.headings.General);
});
