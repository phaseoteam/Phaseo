import { LocalizedRequestError, localizedRequestErrorMessage } from "./localized-request-error";

describe("request error presentation", () => {
	it("preserves a translated request error and its technical code", () => {
		expect(localizedRequestErrorMessage(new LocalizedRequestError("Acceso denegado. permission_denied"), "Error de solicitud")).toBe("Acceso denegado. permission_denied");
	});
	it.each([new TypeError("Failed to fetch"), new SyntaxError("Unexpected token"), new Error("Network connection failed"), null])("uses translated fallback for a runtime error", (error) => {
		expect(localizedRequestErrorMessage(error, "La solicitud no se pudo completar.")).toBe("La solicitud no se pudo completar.");
	});
});
