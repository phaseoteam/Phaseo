import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthSuspenseFallback } from "../AuthSuspenseFallback";
import { AuthWordmark } from "@/components/(gateway)/auth/AuthWordmark";
import { Login } from "@/components/(gateway)/auth/Login";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";
import { buildLocalizedAuthPath } from "@/lib/auth/localized-paths";
import { sanitizeReturnUrl } from "@/lib/auth/return-url";
import { samlSsoFlag } from "@/lib/flags";

export type SignInPageProps = {
	locale: PublicLocale;
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export function SignInPage({ locale, searchParams }: SignInPageProps) {
	return (
		<Suspense fallback={<AuthSuspenseFallback />}>
			<SignInPageContent locale={locale} searchParams={searchParams} />
		</Suspense>
	);
}

async function SignInPageContent({ locale, searchParams }: SignInPageProps) {
	const [ssoEnabled, shared] = await Promise.all([
		samlSsoFlag(),
		getTranslations({ locale, namespace: "Auth.shared" }),
	]);
	const params = (await searchParams) ?? {};
	const signup = Array.isArray(params.signup) ? params.signup[0] : params.signup;
	const signupNotice =
		signup === "exists" || signup === "check-email" ? "check-email" : null;
	const authErrorParam = Array.isArray(params.error)
		? params.error[0]
		: params.error;
	const authError = authErrorParam === "auth-failed" ? "auth-failed" : null;
	const returnUrlParam = Array.isArray(params.returnUrl)
		? params.returnUrl[0]
		: params.returnUrl;
	const sanitizedReturnUrl = sanitizeReturnUrl(
		typeof returnUrlParam === "string" ? returnUrlParam : null,
		"/",
	);
	const returnUrl = sanitizedReturnUrl === "/" ? undefined : sanitizedReturnUrl;
	const localeReturnPath = buildLocalizedAuthPath(defaultLocale, "/sign-in", {
		returnUrl,
		signup: signupNotice ?? undefined,
		error: authError ?? undefined,
	});

	return (
		<div className="min-h-svh">
			<div className="relative grid min-h-svh place-items-center p-6 md:p-10">
				<div className="absolute start-6 top-6 md:start-10 md:top-10">
					<AuthWordmark />
				</div>
				<LocaleSwitcher
					currentLocale={locale}
					returnPath={localeReturnPath}
					label={shared("changeLanguage")}
					className="absolute end-6 top-6 md:end-10 md:top-10"
				/>
				<div className="mx-auto w-full max-w-sm">
					<Login
						signupNotice={signupNotice}
						authError={authError}
						returnUrl={returnUrl}
						ssoEnabled={ssoEnabled}
						locale={locale}
					/>
				</div>
			</div>
		</div>
	);
}
