import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppIntlProvider } from "@/i18n/react";
import { getPublicMessages } from "@/i18n/messages";
import { getSettingsMessages } from "@/i18n/settings";
import { publicLocales } from "@/i18n/routing";
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

it.each(publicLocales)("renders the settings side sheet without missing messages in %s", async (locale) => {
    const messages = await getPublicMessages(locale);
    const copy = getSettingsNavigationCopy(getSettingsMessages(locale), messages.SettingsUI.sidebarNew);
    const onError = jest.fn();
    const html = renderToStaticMarkup(
        <AppIntlProvider locale={locale} timeZone="UTC" messages={messages} onError={onError}>
            <SettingsSidebarTrigger copy={copy} />
        </AppIntlProvider>,
    );
    expect(html).not.toContain("SettingsUI.");
    expect(onError).not.toHaveBeenCalled();
    expect(html).toContain(copy.labels.Preferences);
    expect(html).toContain(copy.headings.General);
});
