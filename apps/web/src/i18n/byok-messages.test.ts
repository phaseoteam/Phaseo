import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import englishMessages from "../../messages/en-GB/settings-ui.json";
import { BYOK_PROVIDER_KEY_SPECS, getProviderCredentialLabel, getProviderKeyOnboarding, validateProviderKeyFormat } from "@/lib/byok/providerKeyValidation";
import { localizedProviderCredentialLabel, localizedProviderKeyHint, localizedProviderKeyInstruction, localizedProviderKeyOnboarding, localizedProviderKeyValidation, localizedProviderSubmissionError } from "./byok-messages";

const locales = ["en-GB", "es-ES", "fr-FR", "de-DE", "pt-BR", "ja", "zh-Hans", "hi", "ar-SA"] as const;
const translator = (locale: typeof locales[number]) => createTranslator({locale, messages: JSON.parse(fs.readFileSync(path.join(__dirname, "../../messages", locale, "settings-ui.json"), "utf8")) as typeof englishMessages, onError: (error) => { throw error; }});

describe("BYOK localized display boundaries", () => {
	it.each(locales)("renders key management labels, warnings, and counts in %s", (locale) => {
		const t = translator(locale);
		for (const key of ["apiKeyTitle", "managementKeyNote", "gatewayKeyNote"]) {
			expect(t(`finalSettingsCopy.${key}` as never)).toContain("AI Stats");
		}
		expect(t("finalSettingsCopy.providerKeyCounts" as never, { priority: 2, fallback: 3 } as never)).toContain("2");
		expect(t("finalSettingsCopy.providerKeyCounts" as never, { priority: 2, fallback: 3 } as never)).toContain("3");
		expect(t("finalSettingsCopy.regexExample" as never, { pattern: "^openai/" } as never)).toContain("^openai/");
		for (const key of ["manageProviderKey", "setProviderKey", "noKeysConfigured", "saveDraft"]) {
			const id = `finalSettingsCopy.${key}`;
			expect(t(id as never)).not.toBe(id);
			if (locale !== "en-GB") expect(t(id as never)).not.toBe(translator("en-GB")(id as never));
		}
	});

	it.each(locales)("renders every known provider in %s", (locale) => {
		const t = translator(locale);
		for (const [provider, spec] of Object.entries(BYOK_PROVIDER_KEY_SPECS)) {
			const hint = localizedProviderKeyHint(provider, t);
			const label = localizedProviderCredentialLabel(provider, t);
			const onboarding = localizedProviderKeyOnboarding(provider, "Provider Brand", t);
			expect(hint).toBeTruthy();
			expect(label).toBeTruthy();
			expect(onboarding.intro).toContain("Provider Brand");
			expect(onboarding.docsLabel).toContain("Provider Brand");
			expect(onboarding.docsUrl).toBe(getProviderKeyOnboarding(provider, "Provider Brand").docsUrl);
			if (locale === "en-GB") expect(hint).toBe(spec.hint);
			if (locale !== "en-GB") {
				expect(hint).not.toBe(spec.hint);
				expect(label).not.toBe(getProviderCredentialLabel(provider));
			}
			const result = validateProviderKeyFormat(provider, "invalid");
			const original = {...result};
			expect(localizedProviderKeyValidation(result, provider, t)).toBeTruthy();
			expect(result).toEqual(original);
		}
	});

	it.each(locales)("preserves credential identifiers, formats, and counts in %s", (locale) => {
		const t = translator(locale);
		for (const [provider, prefix] of [["openai", "sk-proj-"], ["anthropic", "sk-ant-"], ["groq", "gsk_"], ["google-ai-studio", "AIza"]]) {
			expect(localizedProviderKeyHint(provider, t)).toContain(prefix);
		}
		for (const field of ["accessKeyId", "secretAccessKey", "region"]) expect(localizedProviderKeyInstruction("amazon-bedrock", t)).toContain(field);
		for (const field of ["accountId", "apiToken"]) expect(localizedProviderKeyInstruction("cloudflare", t)).toContain(field);
		expect(localizedProviderKeyInstruction("azure", t)).toContain("deployments");
		expect(localizedProviderKeyInstruction("openai", t)).toBeNull();
		expect(localizedProviderKeyHint("google-vertex", t)).toContain("global");
		const short = validateProviderKeyFormat("custom-provider", "x");
		expect(localizedProviderKeyValidation(short, "custom-provider", t)).toContain(new Intl.NumberFormat(locale).format(16));
		for (const value of ["", "with spaces", "sk-abcdefghijklmnop"]) {
			const result = validateProviderKeyFormat("openai", value);
			expect(localizedProviderKeyValidation(result, "openai", t)).toBeTruthy();
		}
		for (const error of ["Bedrock IAM credentials require access key ID, secret access key, and region.", "Cloudflare credentials require both account ID and API token.", "Each Azure deployment needs model slug, endpoint URL, API key, and model ID."]) {
			const displayed = localizedProviderSubmissionError(error, t);
			expect(displayed).toBeTruthy();
			if (locale !== "en-GB") expect(displayed).not.toBe(error);
		}
		expect(localizedProviderKeyOnboarding(null, null, t).intro).toBeTruthy();
	});
});
