"use client";

import { useEffect, useMemo, useState, type FormEventHandler } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { handleEmailSignup } from "@/app/(auth)/sign-up/actions";
import { Eye, EyeOff } from "lucide-react";

const SYMBOL_REGEX = /[!@#$%^&*()_+\-=[\]{};':"|<>?,./`~]/;

type PasswordChecks = {
	hasLower: boolean;
	hasUpper: boolean;
	hasNumber: boolean;
	hasSymbol: boolean;
};

type EmailPasswordProps = {
	onEmailFlowChange?: (active: boolean) => void;
};

function SubmitButton({ disabled }: { disabled: boolean }) {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" className="w-full" disabled={disabled || pending}>
			{pending ? "Creating account..." : "Sign up with email"}
		</Button>
	);
}

export default function EmailPassword({ onEmailFlowChange }: EmailPasswordProps) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [showEmailHeading, setShowEmailHeading] = useState(false);
	const [showRequirements, setShowRequirements] = useState(false);

	const checks = useMemo<PasswordChecks>(() => {
		return {
			hasLower: /[a-z]/.test(password),
			hasUpper: /[A-Z]/.test(password),
			hasNumber: /[0-9]/.test(password),
			hasSymbol: SYMBOL_REGEX.test(password),
		};
	}, [password]);

	const passwordValid =
		checks.hasLower && checks.hasUpper && checks.hasNumber && checks.hasSymbol;
	const emailFlowActive = email.trim().length > 0 || password.length > 0;

	useEffect(() => {
		onEmailFlowChange?.(emailFlowActive);
	}, [emailFlowActive, onEmailFlowChange]);

	useEffect(() => {
		if (!emailFlowActive) {
			setShowEmailHeading(false);
			setShowRequirements(false);
			return;
		}

		const headingTimer = window.setTimeout(() => setShowEmailHeading(true), 180);
		const requirementsTimer = window.setTimeout(() => setShowRequirements(true), 560);

		return () => {
			window.clearTimeout(headingTimer);
			window.clearTimeout(requirementsTimer);
		};
	}, [emailFlowActive]);

	const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
		if (!passwordValid) {
			event.preventDefault();
			setFormError(
				"Password must include lowercase, uppercase, a number, and a symbol."
			);
			return;
		}
		setFormError(null);
	};

	const checkItemClass = (ok: boolean) =>
		ok ? "text-emerald-600" : "text-muted-foreground";

	return (
		<div className="grid gap-4">
			<div className="flex items-center gap-2">
				<div className="flex-1 border-t border-border" />
				<span
					className={`inline-block px-2 text-sm transition-all duration-500 ease-out ${showEmailHeading
						? "text-foreground font-semibold tracking-[0.02em] opacity-100 translate-y-0"
						: "text-muted-foreground font-normal tracking-normal opacity-90 -translate-y-0.5"
					}`}
				>
					{showEmailHeading ? "Email Sign Up" : "Or sign up with email"}
				</span>
				<div className="flex-1 border-t border-border" />
			</div>

			<form action={handleEmailSignup} onSubmit={handleSubmit} className="grid gap-3">
				<div className="grid gap-3">
					<Label htmlFor="email">Email</Label>
					<Input
						id="email"
						name="email"
						type="email"
						placeholder="ai-stats@example.com"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						required
					/>
				</div>

				<div className="grid gap-3">
					<div className="flex items-center">
						<Label htmlFor="password">Password</Label>
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
								if (formError) setFormError(null);
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
								{showPassword ? (
									<EyeOff className="h-4 w-4" />
								) : (
									<Eye className="h-4 w-4" />
								)}
							</button>
						) : null}
					</div>
				</div>

				<div
					className={`grid transition-[grid-template-rows,opacity] duration-350 ease-out ${showRequirements ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
					}`}
					aria-hidden={!showRequirements}
				>
					<div className="overflow-hidden">
						<div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
							<p className="mb-2 font-medium text-foreground">Password requirements</p>
							<ul className="space-y-1">
								<li className={checkItemClass(checks.hasLower)}>
									Contains a lowercase letter
								</li>
								<li className={checkItemClass(checks.hasUpper)}>
									Contains an uppercase letter
								</li>
								<li className={checkItemClass(checks.hasNumber)}>
									Contains a number
								</li>
								<li className={checkItemClass(checks.hasSymbol)}>
									Contains a symbol
								</li>
							</ul>
						</div>
					</div>
				</div>

				{formError ? (
					<p className="text-sm text-red-600" role="alert" aria-live="polite">
						{formError}
					</p>
				) : null}

				<SubmitButton disabled={!email.trim() || !passwordValid} />
			</form>

			<div className="text-center text-sm">
				Already have an account?{" "}
				<Link href="/sign-in" className="underline underline-offset-4">
					Sign in
				</Link>
			</div>
		</div>
	);
}
