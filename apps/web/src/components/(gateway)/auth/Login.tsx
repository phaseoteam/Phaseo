import Link from "@/components/link";
import type { ElementType } from "react";
import AuthErrorMessage from "@/features/error/AuthErrorMessage";
import { Building2 } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import OAuthButtons from "./OAuthButtons";
import EmailPassword from "./EmailPassword";
import { PasskeySignInButton } from "./PasskeySignInButton";
import { Button } from "@/components/ui/button";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";
import {
	buildLocalizedAuthPath,
	withAuthLocale,
} from "@/lib/auth/localized-paths";

type SignupNotice = "check-email" | null;

export function Login({
	signupNotice = null,
	authError = null,
	returnUrl,
	ssoEnabled = false,
	locale = defaultLocale,
	surface = "page",
	Heading = "h1",
	errorCode,
	errorMessage,
}: {
	signupNotice?: SignupNotice;
	authError?: "auth-failed" | null;
	returnUrl?: string;
	ssoEnabled?: boolean;
	locale?: PublicLocale;
	surface?: "page" | "dialog";
	/** The heading element; the dialog passes its title so it labels the dialog. */
	Heading?: ElementType;
	/** An auth error from a callback (an AuthErrorCode, or the legacy message form). */
	errorCode?: string;
	errorMessage?: string;
}) {
	const t = useTranslations("Auth.signIn");
	const signupNoticeText =
		signupNotice === "check-email"
			? t("signupNotice")
			: null;
	const authErrorText =
		authError === "auth-failed" ? (
			t("invalidCredentials")
		) : errorCode || errorMessage ? (
			<AuthErrorMessage initialCode={errorCode} initialMessage={errorMessage} />
		) : null;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col items-center gap-1.5 text-center">
				<Heading className="text-[1.375rem] font-bold">{t("heading")}</Heading>
				<p className="text-sm text-muted-foreground">
					{t("description")}
				</p>
			</div>

			{signupNoticeText ? (
				<p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
					{signupNoticeText}
				</p>
			) : null}
			{authErrorText ? (
				<p
					className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
					role="alert"
					aria-live="polite"
				>
					{authErrorText}
				</p>
			) : null}

			<div className="grid gap-2.5">
				<OAuthButtons returnUrl={returnUrl} locale={locale} />
				<div className={ssoEnabled ? "grid grid-cols-2 gap-2.5" : "grid"}>
					<PasskeySignInButton
						surface={surface}
						returnUrl={returnUrl}
						compact={ssoEnabled}
						locale={locale}
					/>
					{ssoEnabled ? (
						<Button asChild variant="outline" className="h-11 w-full">
							<Link
								href={withAuthLocale(
									buildLocalizedAuthPath(defaultLocale, "/sign-in/enterprise", {
										returnUrl,
									}),
									locale,
								)}
							>
								<Building2
									className="me-2 h-4 w-4"
									aria-hidden="true"
								/>
								{t("sso")}
							</Link>
						</Button>
					) : null}
				</div>
			</div>
			<EmailPassword returnUrl={returnUrl} locale={locale} surface={surface} />
		</div>
	);
}
