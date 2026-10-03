import "server-only";
import { cache } from "react";
import { mergeCatalogMessages } from "./message-overlays";
import type { PublicLocale } from "./routing";
import type { SettingsMessages } from "./settings";

/** Load only the active locale, without importing every settings UI catalog. */
export const getSettingsNavigationMessages = cache(async (locale: PublicLocale): Promise<SettingsMessages> => {
    const sourceLocale = locale === "en-US" ? "en-GB" : locale;
    const messages = (await import(`../../messages/${sourceLocale}/settings.json`)).default as SettingsMessages;
    return locale === "en-US"
        ? mergeCatalogMessages(messages, (await import("../../messages/en-US/settings.overrides.json")).default)
        : messages;
});
