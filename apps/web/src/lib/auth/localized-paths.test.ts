import {
	buildLocalizedAuthPath,
	localizeAuthPath,
	resolveAuthLocale,
	withAuthLocale,
} from "./localized-paths";

describe("localized auth paths", () => {
	it("keeps the source locale unprefixed", () => {
		expect(localizeAuthPath("en-GB", "/sign-in")).toBe("/sign-in");
	});

	it("prefixes every non-default public locale", () => {
		expect(localizeAuthPath("de-DE", "/sign-in")).toBe(
			"/de-DE/sign-in",
		);
		expect(localizeAuthPath("ar-SA", "/error")).toBe("/ar-SA/error");
	});

	it("preserves sanitized flow parameters", () => {
		expect(
			buildLocalizedAuthPath("ja", "/sign-up", {
				returnUrl: "/settings/account",
			}),
		).toBe("/ja/sign-up?returnUrl=%2Fsettings%2Faccount");
	});

	it("validates locale inputs before using them", () => {
		expect(resolveAuthLocale("de-DE")).toBe("de-DE");
		expect(resolveAuthLocale("en-XA")).toBe("en-GB");
		expect(resolveAuthLocale("../../error")).toBe("en-GB");
	});

	it("carries locale on unprefixed technical hand-offs", () => {
		expect(
			withAuthLocale(
				"/auth/verify-mfa?returnUrl=%2Fsettings",
				"pt-BR",
			),
		).toBe("/auth/verify-mfa?returnUrl=%2Fsettings&locale=pt-BR");
	});
});
