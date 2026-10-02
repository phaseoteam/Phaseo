import germanSettingsUiMessages from "../../messages/de-DE/settings-ui.json";
import fs from "node:fs";
import path from "node:path";

function readSettingsSource(): string {
	const root = path.resolve(__dirname, "../app/[locale]/(dashboard)/settings");
	const files: string[] = [];
	const visit = (directory: string) => {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const absolute = path.join(directory, entry.name);
			if (entry.isDirectory()) visit(absolute);
			else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(absolute);
		}
	};
	visit(root);
	return files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
}

describe("German settings UI catalogue", () => {
	it("contains the shared route, status, action, and error vocabulary", () => {
		const strings = germanSettingsUiMessages.strings as Record<string, string>;
		for (const key of [
			"Settings",
			"API Keys",
			"Guardrails",
			"Bring Your Own Key",
			"Workspace access changed",
			"Delete selected API keys?",
			"phraseUnableToRevokeAccessRightNow",
			"phraseSavingPrivacySettings",
		]) {
			expect(typeof strings[key]).toBe("string");
			expect(strings[key]).not.toBe(key);
		}
		for (const [key, value] of Object.entries(germanSettingsUiMessages.headers)) {
			expect(key).not.toBe("");
			expect(value).toEqual(expect.any(String));
			expect(value).not.toBe("");
		}
	});

	it("does not translate protocol and product identifiers", () => {
		expect(germanSettingsUiMessages.strings["OAuth Apps"]).toBe("OAuth-Apps");
		expect(germanSettingsUiMessages.strings["MFA"]).toBe("MFA");
		expect(germanSettingsUiMessages.strings["SCIM"]).toBe("SCIM");
	});

	it("keeps DOM-rewriting localization out of the settings path", () => {
		const source = readSettingsSource();
		expect(source).not.toContain("SettingsLocaleText");
		expect(source).not.toContain("MutationObserver");
		expect(source).not.toContain("querySelector");
		expect(source).not.toContain("textContent");
		expect(
			fs.existsSync(
				path.resolve(
					__dirname,
					"../components/(gateway)/settings/SettingsLocaleText.tsx",
				),
			),
		).toBe(false);
	});
});
