// The two-factor code in the auth dialog, after a password, passkey, OAuth or SSO sign-in
// on an account with MFA. Gated pages stay closed until this succeeds (lib/start/session.ts).
import { useState, type ElementType } from "react";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/react";
import type { PublicLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { verifyMFALoginAction } from "@/features/auth/verify-mfa/actions";
import { authDialogHref } from "@/lib/auth/authDialogRedirect";
import { createClient } from "@/utils/supabase/client";

export function MfaStep({
	returnUrl,
	locale,
	Heading,
}: {
	returnUrl?: string;
	locale: PublicLocale;
	Heading: ElementType;
}) {
	const t = useTranslations("Common.authFlows.mfa");
	const [code, setCode] = useState("");
	const [loading, setLoading] = useState(false);

	const verify = async (codeToVerify?: string) => {
		const finalCode = codeToVerify || code;
		if (!finalCode) {
			toast.error(t("enterCode"));
			return;
		}
		setLoading(true);
		try {
			const result = await verifyMFALoginAction({ data: { code: finalCode, returnUrl: returnUrl ?? "/" } });
			toast.success(t("success"));
			// A full page load: data cached before verification was loaded at the
			// lower assurance level, so client-side navigation would keep it.
			window.location.replace(result.redirectPath);
		} catch {
			toast.error(t("failure"));
			setCode("");
			setLoading(false);
		}
	};

	const signOut = async () => {
		setLoading(true);
		await createClient().auth.signOut();
		window.location.assign(authDialogHref({ params: { locale }, search: {} }, { auth: "sign-in", returnUrl }));
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col items-center gap-1.5 text-center">
				<div className="mb-2 flex size-12 items-center justify-center rounded-md bg-primary/10">
					<ShieldCheck className="size-6 text-primary" aria-hidden="true" />
				</div>
				<Heading className="text-2xl font-bold">{t("title")}</Heading>
				<p className="text-sm text-muted-foreground">{t("description")}</p>
			</div>

			<div className="flex flex-col items-center gap-3">
				<InputOTP
					maxLength={6}
					dir="ltr"
					value={code}
					onChange={setCode}
					onComplete={verify}
					disabled={loading}
					autoFocus
				>
					<InputOTPGroup>
						{[0, 1, 2, 3, 4, 5].map((index) => (
							<InputOTPSlot key={index} index={index} />
						))}
					</InputOTPGroup>
				</InputOTP>
				<p className="text-center text-xs text-muted-foreground">{t("autoVerify")}</p>
			</div>

			<div className="grid gap-2">
				<Button className="w-full" onClick={() => verify()} disabled={code.length !== 6 || loading}>
					{loading ? (
						<>
							<Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
							{t("verifying")}
						</>
					) : (
						t("verify")
					)}
				</Button>
				<Button variant="ghost" className="w-full" onClick={signOut} disabled={loading}>
					<LogOut className="me-2 size-4" aria-hidden="true" />
					{t("signOut")}
				</Button>
			</div>
		</div>
	);
}
