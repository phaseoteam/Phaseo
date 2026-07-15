"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

export function PasskeySignInButton({ returnUrl }: { returnUrl?: string }) {
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
				? safeReturnUrl === "/"
					? "/auth/verify-mfa"
					: `/auth/verify-mfa?returnUrl=${encodeURIComponent(safeReturnUrl)}`
				: safeReturnUrl;

			window.location.assign(redirectPath);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Passkey sign-in failed";
			if (message.includes("passkey_disabled")) {
				toast.error("Passkeys are not enabled for this environment yet.");
			} else if (message.toLowerCase().includes("cancel")) {
				toast.message("Passkey sign-in cancelled.");
			} else {
				toast.error(message);
			}
		} finally {
			setPending(false);
		}
	}

	return (
		<Button type="button" variant="outline" className="h-12 w-full" onClick={signIn} disabled={pending}>
			{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
			{pending ? "Signing in with passkey..." : "Sign in with a passkey"}
		</Button>
	);
}
