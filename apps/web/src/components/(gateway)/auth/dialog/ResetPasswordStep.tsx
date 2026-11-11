// Setting a new password in the auth dialog, after /auth/reset-password has picked up
// the recovery session from the reset email.
import { useState, type ElementType, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useTranslations } from "@/i18n/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordStrengthIndicator } from "@/components/(gateway)/settings/account/PasswordStrengthIndicator";
import { revokeOtherSessionsAfterPasswordResetAction } from "@/features/auth/reset-password/actions";
import { createClient } from "@/utils/supabase/client";

export function ResetPasswordStep({ Heading }: { Heading: ElementType }) {
	const t = useTranslations("Common.authFlows.passwordReset");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [loading, setLoading] = useState(false);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const parsed = z
			.object({
				password: z
					.string()
					.min(8, t("minLength"))
					.regex(/[A-Z]/, t("uppercase"))
					.regex(/[a-z]/, t("lowercase"))
					.regex(/[0-9]/, t("number")),
				confirmPassword: z.string(),
			})
			.refine((data) => data.password === data.confirmPassword, {
				message: t("mismatch"),
				path: ["confirmPassword"],
			})
			.safeParse({ password, confirmPassword });
		if (!parsed.success) {
			toast.error(parsed.error.issues[0]?.message ?? t("checkInputs"));
			return;
		}

		setLoading(true);
		try {
			const { error } = await createClient().auth.updateUser({ password });
			if (error) throw error;
			// Sign out every other session and app grant made with the old password.
			const revoked = await revokeOtherSessionsAfterPasswordResetAction()
				.then(() => true)
				.catch(() => false);
			if (!revoked) {
				toast.error(t("signOutOthersFailed"));
				setLoading(false);
				return;
			}
			toast.success(t("success"));
			window.location.assign("/settings/account");
		} catch {
			toast.error(t("failure"));
			setLoading(false);
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col items-center gap-1.5 text-center">
				<Heading className="text-2xl font-bold">{t("setTitle")}</Heading>
				<p className="text-sm text-muted-foreground">{t("description")}</p>
			</div>

			<form onSubmit={submit} className="grid gap-4">
				<div className="grid gap-2">
					<Label htmlFor="reset-password">{t("newPassword")}</Label>
					<Input
						id="reset-password"
						type="password"
						dir="ltr"
						autoComplete="new-password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						placeholder={t("newPasswordPlaceholder")}
						disabled={loading}
						autoFocus
					/>
					{password ? <PasswordStrengthIndicator password={password} /> : null}
				</div>
				<div className="grid gap-2">
					<Label htmlFor="reset-password-confirm">{t("confirmPassword")}</Label>
					<Input
						id="reset-password-confirm"
						type="password"
						dir="ltr"
						autoComplete="new-password"
						value={confirmPassword}
						onChange={(event) => setConfirmPassword(event.target.value)}
						placeholder={t("confirmPasswordPlaceholder")}
						disabled={loading}
					/>
				</div>
				<Button type="submit" className="w-full" disabled={!password || !confirmPassword || loading}>
					{loading ? (
						<>
							<Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
							{t("resetting")}
						</>
					) : (
						t("submit")
					)}
				</Button>
			</form>
		</div>
	);
}
