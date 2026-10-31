import { createTranslator } from "@/i18n/react";
import { getPublicMessages } from "@/i18n/messages";
import { publicLocales } from "@/i18n/routing";

function leafKeys(value: unknown, prefix: string): string[] {
	if (value && typeof value === "object") {
		return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
	}
	return [prefix];
}

describe("trusted workloads copy", () => {
	it.each(publicLocales)("formats every message in %s", async (locale) => {
		const messages = await getPublicMessages(locale);
		const source = await getPublicMessages("en-GB");
		const keys = leafKeys((source.SettingsUI as Record<string, unknown>).trustedWorkloads, "SettingsUI.trustedWorkloads");
		expect(keys.length).toBeGreaterThan(50);
		const onError = jest.fn();
		const t = createTranslator({ locale, messages, onError } as never);
		for (const key of [...keys, "SettingsUI.settingsPageMetadata.trustedWorkloads", "SettingsUI.sidebarNew.trustedWorkloads"]) {
			expect(t(key as never, { name: "Website", count: 2, max: 12, message: "x" } as never)).toEqual(expect.any(String));
		}
		expect(onError).not.toHaveBeenCalled();
	});
});
