import { useTranslations } from "@/i18n/react";
import { captureProductEvent } from "@/lib/productAnalytics";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";
import SharedOAuthButtons from "../OAuthButtons";

/** Sign-up's provider row: the shared buttons (with their redirect state) under a "quick sign-up" divider. */
export default function OAuthButtons({
	returnUrl,
	locale = defaultLocale,
	onRedirectingChange,
}: {
	returnUrl?: string;
	locale?: PublicLocale;
	onRedirectingChange?: (redirecting: boolean) => void;
}) {
	const t = useTranslations("Auth.signUp");

	return (
		<div className="grid gap-4">
			<div className="flex items-center gap-2">
				<div className="flex-1 border-t border-border" />
				<span className="px-2 text-sm font-medium">{t("quickSignup")}</span>
				<div className="flex-1 border-t border-border" />
			</div>

			<SharedOAuthButtons
				flow="signup"
				returnUrl={returnUrl}
				locale={locale}
				onStart={(provider) => captureProductEvent("account_signup_started", { method: provider })}
				onRedirectingChange={onRedirectingChange}
			/>
		</div>
	);
}
