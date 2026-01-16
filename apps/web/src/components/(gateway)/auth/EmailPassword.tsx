"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { handlePasswordSignIn, forgotPasswordAction } from "@/app/(auth)/sign-in/actions";
import { ForgotPasswordDialog } from "./ForgotPasswordDialog";

export default function EmailPassword() {
	const [forgotPasswordOpen, setForgotPasswordOpen] = React.useState(false);

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
							className="ml-auto text-sm underline-offset-4 hover:underline"
						>
							Forgot your password?
						</button>
					</div>
					<Input
						id="password"
						name="password"
						type="password"
						required
					/>
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
