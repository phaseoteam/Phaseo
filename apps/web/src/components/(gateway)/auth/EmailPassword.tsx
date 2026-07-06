"use client";

import * as React from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { handlePasswordSignIn, forgotPasswordAction } from "@/app/(auth)/sign-in/actions";
import { ForgotPasswordDialog } from "./ForgotPasswordDialog";
import { Eye, EyeOff } from "lucide-react";

const LAST_AUTH_PROVIDER_STORAGE_KEY = "ai-stats:last-auth-provider";

function SubmitButton() {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" className="w-full" disabled={pending}>
			{pending ? "Signing in..." : "Sign in with email"}
		</Button>
	);
}

export default function EmailPassword({
	returnUrl,
	isLastUsed = false,
}: {
	returnUrl?: string;
	isLastUsed?: boolean;
}) {
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
						Or sign in with email
					</span>
					{showLastUsed ? (
						<span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
							Last Used
						</span>
					) : null}
				</div>
				<div className="flex-1 border-t border-border" />
			</div>

			<form action={handlePasswordSignIn} className="grid gap-3" onSubmit={handleSubmit}>
				{returnUrl ? (
					<input type="hidden" name="returnUrl" value={returnUrl} />
				) : null}
				<div className="grid gap-3">
					<Label htmlFor="email">Email</Label>
					<Input
						id="email"
						name="email"
						type="email"
						placeholder="ai-stats@example.com"
						required
					/>
				</div>

				<div className="grid gap-3">
					<div className="flex h-5 items-center">
						<Label htmlFor="password">Password</Label>
						<button
							type="button"
							onClick={() => setForgotPasswordOpen(true)}
							className="ml-auto text-sm leading-none underline decoration-transparent underline-offset-4 transition-colors duration-200 hover:decoration-current"
						>
							Forgot your password?
						</button>
					</div>
					<div className="relative">
						<Input
							id="password"
							name="password"
							type={showPassword ? "text" : "password"}
							value={password}
							className={password.length > 0 ? "pr-10" : undefined}
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
								aria-label={showPassword ? "Hide password" : "Show password"}
								aria-pressed={showPassword}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							>
								{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
							</button>
						) : null}
					</div>
				</div>

				<SubmitButton />
			</form>

			<div className="text-center text-sm">
				Don&apos;t have an account?{" "}
				<Link
					href={returnUrl ? `/sign-up?returnUrl=${encodeURIComponent(returnUrl)}` : "/sign-up"}
					className="underline underline-offset-4"
				>
					Sign up
				</Link>
				<div className="mt-2">
					<Link
						href={
							returnUrl
								? `/sign-in/enterprise?returnUrl=${encodeURIComponent(returnUrl)}`
								: "/sign-in/enterprise"
						}
						className="text-muted-foreground underline underline-offset-4"
					>
						Enterprise Login
					</Link>
				</div>
			</div>

			<ForgotPasswordDialog
				open={forgotPasswordOpen}
				onOpenChange={setForgotPasswordOpen}
				onSubmit={forgotPasswordAction}
			/>
		</div>
	);
}

