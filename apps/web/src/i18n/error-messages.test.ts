import { createTranslator } from "next-intl";
import { getPublicMessages } from "./messages";
import { localizedSettingsError } from "./error-messages";

describe("localized settings errors", () => {
	it("translates known server errors and falls back for unknown messages", async () => {
		const messages = await getPublicMessages("es-ES");
		const translate = createTranslator({
			locale: "es-ES",
			messages,
			namespace: "SettingsUI",
		} as never);

		expect(
			localizedSettingsError(
				new Error('Type "DELETE" to confirm'),
				translate as never,
				"Could not delete account",
			),
		).toBe('Escribe "DELETE" para confirmar');
		expect(
			localizedSettingsError(
				new Error("some upstream error"),
				translate as never,
				"Could not delete account",
			),
		).toBe("No se pudo eliminar la cuenta");
	});
});
