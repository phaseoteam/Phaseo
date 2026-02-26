"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { handlePasswordSignIn, forgotPasswordAction } from "@/app/(auth)/sign-in/actions";
import { ForgotPasswordDialog } from "./ForgotPasswordDialog";
import { Eye, EyeOff } from "lucide-react";

export default function EmailPassword() {
	const [forgotPasswordOpen, setForgotPasswordOpen] = React.useState(false);
	const [showPassword, setShowPassword] = React.useState(false);
	const [password, setPassword] = React.useState("");

	return (
		<div className="grid gap-4">
			<div className="flex items-center gap-2">
				<div className="flex-1 border-t border-border" />
				<span className="px-2 text-sm text-muted-foreground">
					Or sign in with email
				</span>
				<div className="flex-1 border-t border-border" />
			</div>

			<form action={handlePasswordSignIn} className="grid gap-3">
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
					<div className="flex items-center">
						<Label htmlFor="password">Password</Label>
						<button
							type="button"
							onClick={() => setForgotPasswordOpen(true)}
							className="ml-auto text-sm underline-offset-4 underline decoration-transparent hover:decoration-current transition-colors duration-200"
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

				<Button type="submit" className="w-full">
					Sign in with email
				</Button>
			</form>

			<div className="text-center text-sm">
				Don&apos;t have an account?{" "}
				<Link href="/sign-up" className="underline underline-offset-4">
					Sign up
				</Link>
			</div>

			<ForgotPasswordDialog
				open={forgotPasswordOpen}
				onOpenChange={setForgotPasswordOpen}
				onSubmit={forgotPasswordAction}
			/>
		</div>
	);
}

