import { createTranslator } from "next-intl";
import { getSettingsMessages } from "@/i18n/settings";
import { getSettingsNavigationMessages } from "@/i18n/settings-navigation-messages";
import { getPublicMessages } from "@/i18n/messages";
import { publicLocales } from "@/i18n/routing";
import { selectMessages, SHELL_MESSAGE_NAMESPACES } from "@/i18n/message-scopes";
import { getSettingsSidebar } from "./Sidebar.config";
import { getSettingsNavigationCopy } from "./Sidebar.labels";

describe("settings sheet translations", () => {
    it.each(publicLocales)("covers navigation and dialog copy in %s", async (locale) => {
        const messages = await getPublicMessages(locale);
        const navigation = await getSettingsNavigationMessages(locale);
        expect(navigation).toEqual(getSettingsMessages(locale));
        const copy = getSettingsNavigationCopy(navigation, messages.SettingsUI.sidebarNew);
        const groups = getSettingsSidebar({ showBroadcast: true, showWebhooks: true, showEnterprise: true, showAutoRouting: true, showInternal: true });
        for (const group of groups) {
            if (group.heading) expect(copy.headings[group.heading]).toEqual(expect.any(String));
            for (const item of group.items) {
                expect(copy.labels[item.label]).toEqual(expect.any(String));
                if (item.badge) expect(copy.badges[item.badge]).toEqual(expect.any(String));
                for (const child of item.children ?? []) expect(copy.labels[child.label]).toEqual(expect.any(String));
            }
        }
        const onError = jest.fn();
        const t = createTranslator({ locale, messages, onError } as never);
        for (const key of [
            "SettingsUI.credits.Key scope", "SettingsUI.credits.Create Management API Key",
            "SettingsUI.credits.Client Secret", "SettingsUI.credits.Regenerate Client Secret?",
            "SettingsUI.credits.Routing Preference", "SettingsUI.credits.System Prompt",
            "SettingsUI.guardrailEditorCopy.allowAllExceptSelectedModels",
            "SettingsUI.presetPage.fork", "SettingsUI.presetPage.copyReference",
            "SettingsUI.settingsPageCopy.backToDestinations", "SettingsUI.observability.unknownModel",
            "SettingsUI.observability.noApiKey", "SettingsUI.observability.noApp",
            "SettingsUI.strings.Add notifier", "SettingsUI.strings.phraseConnectOneOrMoreChannelsToWorkspaceAlerts",
        ]) expect(t(key as never)).toEqual(expect.any(String));
        // The header sheet is outside the settings page provider.
        const shell = createTranslator({ locale, messages: selectMessages(messages, SHELL_MESSAGE_NAMESPACES), onError } as never);
        for (const key of ["open", "close", "description", "scope", "settingsTitle", "accountScope", "workspaceScope"])
            expect(shell(`SettingsUI.settingsCopy.settingsSidebar.${key}` as never)).toEqual(expect.any(String));
        expect(onError).not.toHaveBeenCalled();
    });
});
