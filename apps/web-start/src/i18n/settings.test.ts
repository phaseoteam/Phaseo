import en from "../../messages/en-GB/settings.json";
import de from "../../messages/de-DE/settings.json";

function flatten(value: unknown, prefix = "", output: Record<string, string> = {}) {
	if (typeof value === "string") {
		output[prefix] = value;
		return output;
	}
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		flatten(child, prefix ? `${prefix}.${key}` : key, output);
	}
	return output;
}

describe("settings domain catalog", () => {
	it("keeps the German catalog structurally complete", () => {
		expect(Object.keys(flatten(de)).sort()).toEqual(Object.keys(flatten(en)).sort());
	});

	it("translates the settings navigation and key page chrome", () => {
		expect(de.sidebar.settings).toBe("Einstellungen");
		expect(de.sidebar.items.paymentMethods).toBe("Zahlungsmethoden");
		expect(de.pages.currentBalance).toBe("Aktueller Kontostand");
		expect(de.common.removePaymentMethod).toBe("Zahlungsmethode entfernen?");
	});
});
