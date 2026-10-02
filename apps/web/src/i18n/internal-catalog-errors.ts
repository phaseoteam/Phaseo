import { WebApiError } from "@/lib/web-api/client";

type Translator = { (key: never): string; has(key: never): boolean };

/** Keep API diagnostics in the console; only reviewed copy is shown to users. */
export function localizedInternalCatalogError(
	error: unknown,
	t: Translator,
	fallbackKey: string,
	localMessageKeys: string[] = [],
): string {
	console.error(error);
	const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
	for (const key of localMessageKeys) {
		const translated = t(key as never);
		if (message === translated) return translated;
	}
	if (error instanceof SyntaxError) return t("Common.ui.pricingEditorCopy.enterValidJson" as never);
	if (error instanceof RangeError && message === "Invalid time value") return t("Common.ui.pricingEditorCopy.enterValidDateTime" as never);
	if (error instanceof WebApiError) {
		if (error.status === 401) return t("Common.ui.pricingEditorCopy.signInToContinue" as never);
		if (error.status === 403) return t("Common.ui.pricingEditorCopy.noPermission" as never);
		if (error.status === 400) return t("Common.ui.pricingEditorCopy.checkRecordValues" as never);
	}
	return t(fallbackKey as never);
}
