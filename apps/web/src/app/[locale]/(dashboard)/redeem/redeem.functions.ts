// Redeem page data plus its signed-out redirect. The route's beforeLoad runs
// the query through ensureQueryData so the redirect happens before anything
// renders; the page reads the cached result.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";
import { isPromoCodeFormatValid, normalizePromoCodeInput } from "@/lib/credits/promoCodes";

/** Links such as the feedback thank-you page prefill the code; anything malformed is ignored. */
export function redeemCodeFromSearch(rawCode: unknown): string {
	return typeof rawCode === "string" && isPromoCodeFormatValid(rawCode) ? normalizePromoCodeInput(rawCode) : "";
}

const loadRedeemPage = createServerFn({ method: "GET" })
	.validator((input: { locale: string; code: string }) => ({ locale: String(input.locale), code: String(input.code) }))
	.handler(async ({ data: { locale, code } }) => {
		const [{ redirect }, { fetchRedeemInitialData }] = await Promise.all([
			import("@/lib/navigation"),
			import("@/lib/fetchers/internal/fetchRedeemInitialData"),
		]);
		const initialData = await fetchRedeemInitialData();

		if (!initialData.signedIn) {
			const redeemPath = `/${locale === "en-GB" ? "" : `${locale}/`}redeem${code ? `?code=${encodeURIComponent(code)}` : ""}`;
			redirect(`/${locale === "en-GB" ? "" : `${locale}/`}sign-in?returnUrl=${encodeURIComponent(redeemPath)}`);
		}
		return initialData;
	});

export const redeemPageQuery = (locale: string, code: string) =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "redeem-page", locale, code],
		queryFn: () => loadRedeemPage({ data: { locale, code } }),
		// The signed-out redirect is thrown from here; never retry it.
		retry: false,
	});
