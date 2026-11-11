import * as React from "react";
import Link from "@/components/link";
import { useFormStatus } from "react-dom";
import { useTranslations } from "@/i18n/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { handlePasswordSignIn, forgotPasswordAction } from "@/features/sign-in/actions";
import { ForgotPasswordDialog } from "./ForgotPasswordDialog";
import { Eye, EyeOff } from "lucide-react";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";
import { buildLocalizedAuthPath } from "@/lib/auth/localized-paths";
import { openAuthDialog } from "./dialog/authDialogStore";

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
	surface = "page",
	initialError = null,
	onEmailFlowChange,
}: {
	returnUrl?: string;
	isLastUsed?: boolean;
	locale?: PublicLocale;
	/** In the sign-in dialog a wrong password is shown in place instead of loading /sign-in. */
	surface?: "page" | "dialog";
	/** A wrong-password error from the URL (/sign-in?error=auth-failed). */
	initialError?: "auth-failed" | null;
	/** Called with true once an email or password is typed (the other options collapse). */
	onEmailFlowChange?: (active: boolean) => void;
}) {
	const shared = useTranslations("Auth.shared");
	const t = useTranslations("Auth.signIn");
	const [forgotPasswordOpen, setForgotPasswordOpen] = React.useState(false);
	const [showPassword, setShowPassword] = React.useState(false);
	// Controlled, so a failed attempt in the dialog keeps what was typed (form actions reset uncontrolled fields).
	const [email, setEmail] = React.useState("");
	const [password, setPassword] = React.useState("");
	// Shown under the fields, and cleared as soon as either is edited.
	const [error, setError] = React.useState<"auth-failed" | null>(initialError);
	const emailFlowActive = email.trim().length > 0 || password.length > 0;
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

	React.useEffect(() => {
		onEmailFlowChange?.(emailFlowActive);
	}, [emailFlowActive, onEmailFlowChange]);

	const handleSubmit: React.FormEventHandler<HTMLFormElement> = () => {
		try {
			window.localStorage.setItem(LAST_AUTH_PROVIDER_STORAGE_KEY, "email");
		} catch {
			// Ignore storage failures; auth still proceeds.
		}
	};

	return (
		// A flex column, not a grid: the collapsed divider's negative margin can then cancel its gap.
		<div className="flex flex-col gap-3.5">
			{/* The divider collapses with the other options once an email or password is typed. */}
			<div
				className={`-mb-3.5 grid transition-[grid-template-rows,opacity,margin] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${emailFlowActive ? "grid-rows-[0fr] opacity-0" : "mb-0 grid-rows-[1fr] opacity-100"}`}
				aria-hidden={emailFlowActive}
			>
			<div className="flex items-center gap-2 overflow-hidden">
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
			</div>

			<form
				action={async (formData) => {
					const result = await handlePasswordSignIn({ data: formData });
					if (result?.step === "mfa") {
						openAuthDialog({ step: "mfa", returnUrl: returnUrl ?? "/" });
						return;
					}
					if (result?.error) {
						setPassword("");
						setShowPassword(false);
						setError(result.error);
					}
				}}
				className="grid gap-3.5"
				onSubmit={handleSubmit}
			>
				<input type="hidden" name="locale" value={locale} />
				{surface === "dialog" ? <input type="hidden" name="surface" value="dialog" /> : null}
				{returnUrl ? (
					<input type="hidden" name="returnUrl" value={returnUrl} />
				) : null}
				<div className="grid gap-1.5">
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
						value={email}
						onChange={(event) => {
							setEmail(event.target.value);
							setError(null);
						}}
						aria-invalid={error ? true : undefined}
						aria-describedby={error ? "sign-in-error" : undefined}
						required
					/>
				</div>

				<div className="grid gap-1.5">
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
								setError(null);
								if (!next) setShowPassword(false);
							}}
							aria-invalid={error ? true : undefined}
							aria-describedby={error ? "sign-in-error" : undefined}
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

				{error ? (
					<p id="sign-in-error" className="text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite">
						{t("invalidCredentials")}
					</p>
				) : null}

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
				onSubmit={(email) => forgotPasswordAction({ data: { email, localeInput: locale } })}
			/>
		</div>
	);
}
