// The dialog body for AuthDialog: one view per step of the sign-in flow.
import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useLocale } from "@/i18n/react";
import type { PublicLocale } from "@/i18n/routing";
import { AnalyticsIdentitySync } from "@/components/analytics/AnalyticsIdentitySync";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { samlSsoEnabledQuery } from "@/features/sign-in/SignInPage.functions";
import { Login } from "../Login";
import { SignUp } from "../sign-up/SignUp";
import { MfaStep } from "./MfaStep";
import { ResetPasswordStep } from "./ResetPasswordStep";
import { SsoStep } from "./SsoStep";
import type { AuthDialogState } from "./authDialogStore";

function SignInStep({ state, locale }: { state: AuthDialogState; locale: PublicLocale }) {
	const { data: ssoEnabled } = useSuspenseQuery(samlSsoEnabledQuery());
	return (
		<Login
			signupNotice={state.notice === "check-email" ? "check-email" : null}
			authError={state.notice === "auth-failed" ? "auth-failed" : null}
			errorCode={state.errorCode}
			errorMessage={state.errorMessage}
			returnUrl={state.returnUrl}
			ssoEnabled={ssoEnabled}
			locale={locale}
			surface="dialog"
			Heading={DialogTitle}
		/>
	);
}

function StepView({ state, locale }: { state: AuthDialogState; locale: PublicLocale }) {
	switch (state.step) {
		case "sign-up":
			return <SignUp returnUrl={state.returnUrl} locale={locale} surface="dialog" Heading={DialogTitle} />;
		case "sso":
			return <SsoStep returnUrl={state.returnUrl} locale={locale} Heading={DialogTitle} />;
		case "mfa":
			return <MfaStep returnUrl={state.returnUrl} locale={locale} Heading={DialogTitle} />;
		case "reset":
			return <ResetPasswordStep Heading={DialogTitle} />;
		default:
			return <SignInStep state={state} locale={locale} />;
	}
}

export default function AuthDialogContent({
	state,
	onOpenChange,
}: {
	state: AuthDialogState;
	onOpenChange: (open: boolean) => void;
}) {
	const locale = useLocale() as PublicLocale;
	// The two-factor and new-password steps belong to a session that is already signed in.
	const startsNewSession = state.step === "sign-in" || state.step === "sign-up" || state.step === "sso";

	return (
		<Dialog open={state.open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto px-6 pt-10 pb-6 sm:max-w-sm sm:px-8 sm:pb-8">
				{/* Whoever signs in or up here may be another account: drop a stale identified person (as the full pages did). */}
				{state.open && startsNewSession ? <AnalyticsIdentitySync userId={null} workspaceId={null} signedUpAt={null} /> : null}
				<Suspense
					fallback={
						<div className="grid min-h-80 place-items-center">
							<Spinner className="size-5 text-muted-foreground" />
						</div>
					}
				>
					<StepView state={state} locale={locale} />
				</Suspense>
			</DialogContent>
		</Dialog>
	);
}
