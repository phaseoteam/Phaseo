"use client";

import * as React from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { handlePasswordSignIn, forgotPasswordAction } from "@/app/(auth)/sign-in/actions";
import { ForgotPasswordDialog } from "./ForgotPasswordDialog";
import { Eye, EyeOff } from "lucide-react";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";
import { buildLocalizedAuthPath } from "@/lib/auth/localized-paths";

const LAST_AUTH_PROVIDER_STORAGE_KEY = "phaseo:last-auth-provider";

function SubmitButton() {
	const { pending } = useFormStatus();
	const t = useTranslations("Auth.signIn");

	return (
		<Button type="submit" className="w-full" disabled={pending}>
			{pending ? t("pending") : t("emailSubmit")}
		</Button>
	);
}

export default function EmailPassword({
	returnUrl,
	isLastUsed = false,
	locale = defaultLocale,
}: {
	returnUrl?: string;
	isLastUsed?: boolean;
	locale?: PublicLocale;
}) {
	const shared = useTranslations("Auth.shared");
	const t = useTranslations("Auth.signIn");
	const [forgotPasswordOpen, setForgotPasswordOpen] = React.useState(false);
	const [showPassword, setShowPassword] = React.useState(false);
	const [password, setPassword] = React.useState("");
	const [storedLastUsedProvider, setStoredLastUsedProvider] =
		React.useState<string | null>(null);
	const showLastUsed = isLastUsed || storedLastUsedProvider === "email";

	React.useEffect(() => {
		try {
			setStoredLastUsedProvider(
				window.localStorage.getItem(LAST_AUTH_PROVIDER_STORAGE_KEY)
			);
		} catch {
			setStoredLastUsedProvider(null);
		}
	}, []);

	const handleSubmit: React.FormEventHandler<HTMLFormElement> = () => {
		try {
			window.localStorage.setItem(LAST_AUTH_PROVIDER_STORAGE_KEY, "email");
		} catch {
			// Ignore storage failures; auth still proceeds.
		}
	};

	return (
		<div className="grid gap-4">
			<div className="flex items-center gap-2">
				<div className="flex-1 border-t border-border" />
				<div className="flex items-center gap-2 px-2">
					<span className="text-sm text-muted-foreground">
						{t("emailDivider")}
					</span>
					{showLastUsed ? (
						<span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
							{shared("lastUsed")}
						</span>
					) : null}
				</div>
				<div className="flex-1 border-t border-border" />
			</div>

			<form
				action={handlePasswordSignIn}
				className="grid gap-3"
				onSubmit={handleSubmit}
			>
				<input type="hidden" name="locale" value={locale} />
				{returnUrl ? (
					<input type="hidden" name="returnUrl" value={returnUrl} />
				) : null}
				<div className="grid gap-3">
					<Label htmlFor="email">{shared("email")}</Label>
					<Input
						id="email"
						name="email"
						type="email"
						dir="ltr"
						autoComplete="email"
						autoCapitalize="none"
						spellCheck={false}
						placeholder={shared("emailPlaceholder")}
						required
					/>
				</div>

				<div className="grid gap-3">
					<div className="flex h-5 items-center">
						<Label htmlFor="password">{shared("password")}</Label>
						<button
							type="button"
							onClick={() => setForgotPasswordOpen(true)}
							className="ms-auto text-sm leading-none underline decoration-transparent underline-offset-4 transition-colors duration-200 hover:decoration-current"
						>
							{t("forgotPassword")}
						</button>
					</div>
					<div className="relative" dir="ltr">
						<Input
							id="password"
							name="password"
							type={showPassword ? "text" : "password"}
							dir="ltr"
							autoComplete="current-password"
							value={password}
							className={password.length > 0 ? "pe-10" : undefined}
							onChange={(event) => {
								const next = event.target.value;
								setPassword(next);
								if (!next) setShowPassword(false);
							}}
							required
						/>
						{password.length > 0 ? (
							<button
								type="button"
								onClick={() => setShowPassword((value) => !value)}
								aria-label={
									showPassword
										? shared("hidePassword")
										: shared("showPassword")
								}
								aria-pressed={showPassword}
								className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							>
								{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
							</button>
						) : null}
					</div>
				</div>

				<SubmitButton />
			</form>

			<div className="text-center text-sm">
				{t("noAccount")} {" "}
				<Link
					href={buildLocalizedAuthPath(locale, "/sign-up", { returnUrl })}
					className="underline underline-offset-4"
				>
					{t("signUpLink")}
				</Link>
			</div>

			<ForgotPasswordDialog
				open={forgotPasswordOpen}
				onOpenChange={setForgotPasswordOpen}
				onSubmit={(email) => forgotPasswordAction(email, locale)}
			/>
		</div>
	);
}
