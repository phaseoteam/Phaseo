"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";
import { withAuthLocale } from "@/lib/auth/localized-paths";

export function PasskeySignInButton({
	returnUrl,
	compact = false,
	locale = defaultLocale,
}: {
	returnUrl?: string;
	compact?: boolean;
	locale?: PublicLocale;
}) {
	const t = useTranslations("Auth.signIn");
	const [pending, setPending] = useState(false);

	async function signIn() {
		setPending(true);
		try {
			const supabase = createClient();
			const { error } = await supabase.auth.signInWithPasskey();
			if (error) throw error;

			const safeReturnUrl =
				returnUrl?.startsWith("/") && !returnUrl.startsWith("//")
					? returnUrl
					: "/";
			const { data: aalData } =
				await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
			const mustVerifyMfa =
				aalData?.currentLevel === "aal1" && aalData?.nextLevel === "aal2";
			const redirectPath = mustVerifyMfa
				? withAuthLocale(
						safeReturnUrl === "/"
							? "/auth/verify-mfa"
							: `/auth/verify-mfa?returnUrl=${encodeURIComponent(safeReturnUrl)}`,
						locale,
					)
				: safeReturnUrl;

			window.location.assign(redirectPath);
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			if (message.includes("passkey_disabled")) {
				toast.error(t("passkeyUnavailable"));
			} else if (message.toLowerCase().includes("cancel")) {
				toast.message(t("passkeyCancelled"));
			} else {
				toast.error(t("passkeyFailed"));
			}
		} finally {
			setPending(false);
		}
	}

	return (
		<Button
			type="button"
			variant="outline"
			className="h-11 w-full"
			onClick={signIn}
			disabled={pending}
		>
			{pending ? (
				<Loader2 className="me-2 h-4 w-4 animate-spin" />
			) : (
				<KeyRound className="me-2 h-4 w-4" />
			)}
			{pending ? t("pending") : compact ? t("passkey") : t("passkeySubmit")}
		</Button>
	);
}
