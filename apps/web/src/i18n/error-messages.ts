type MessageTranslator = {
	(key: never): string;
	has(key: never): boolean;
};

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	if (
		error &&
		typeof error === "object" &&
		"message" in error &&
		typeof error.message === "string"
	) {
		return error.message;
	}
	return "";
}

export function localizedSettingsError(
	error: unknown,
	translate: MessageTranslator,
	fallbackKey: string,
	fallbackMessage?: string,
): string {
	const message = getErrorMessage(error);
	const messageKey = `strings.${message}`;
	if (message && translate.has(messageKey as never)) {
		return translate(messageKey as never);
	}
	return fallbackMessage ?? translate(`strings.${fallbackKey}` as never);
}
