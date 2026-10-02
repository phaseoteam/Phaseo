import { createTranslator } from "next-intl";
import { localizedWorkspacePolicyReason } from "./workspace-policy-messages";
import { formatRelativeToNow } from "@/lib/formatRelative";

const locales = ["es-ES", "fr-FR", "de-DE", "pt-BR", "ja", "zh-Hans", "hi", "ar-SA"] as const;

describe.each(locales)("Shared policy and relative copy in %s", (locale) => {
	const messages = {Common: require(`../../messages/${locale}/common.json`)};
	const t = createTranslator({locale, messages, namespace: "Common.ui.localisationGaps"});

	it("translates system reasons while retaining the guardrail name", () => {
		expect(localizedWorkspacePolicyReason(t, {source: "workspace", label: "Blocked by workspace Data Controls", settingsHref: "/settings/privacy"})).toBe(t("blockedByWorkspace"));
		const name = "My English Guardrail";
		expect(localizedWorkspacePolicyReason(t, {source: "guardrail", guardrailName: name, label: `Blocked by ${name}`, settingsHref: "/settings/guardrails/id"})).toBe(t("blockedByGuardrail", {name}));
		expect(localizedWorkspacePolicyReason(t, {source: "guardrail", label: `Blocked by ${name}`, settingsHref: "/settings/guardrails/id"})).toBe(t("blockedByGuardrail", {name}));
	});

	it("formats relative times in the selected language", () => {
		const now = Date.UTC(2026, 9, 2);
		const formatter = new Intl.RelativeTimeFormat(locale, {numeric: "auto"});
		expect(formatRelativeToNow(now - 600_000, now, locale)).toBe(formatter.format(-10, "minute"));
		expect(formatRelativeToNow(now - 7_200_000, now, locale)).toBe(formatter.format(-2, "hour"));
		expect(formatRelativeToNow(now, now, locale)).toBe(formatter.format(0, "second"));
	});
});

it("preserves existing relative formatting for callers without a locale", () => {
	expect(formatRelativeToNow(0, 600_000)).toBe("10 minutes ago");
});
