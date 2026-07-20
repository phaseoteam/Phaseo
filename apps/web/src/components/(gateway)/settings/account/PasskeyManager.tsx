"use client";

import * as React from "react";
import { KeyRound, Loader2, LogIn, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
	deletePasskeyAction,
	startPasskeyRegistrationAction,
	verifyPasskeyRegistrationAction,
} from "@/app/(dashboard)/settings/account/actions";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	parsePasskeyCreationOptions,
	serializePasskeyRegistrationCredential,
} from "@/lib/auth/passkeyWebAuthn";
import { createClient } from "@/utils/supabase/client";

type Passkey = {
	id: string;
	friendly_name?: string;
	created_at: string;
	last_used_at?: string;
};

type PendingPasskeyAction =
	| { type: "register" }
	| { passkeyId: string; type: "remove" };

export function PasskeyManager({ hasPassword }: { hasPassword: boolean }) {
	const [passkeys, setPasskeys] = React.useState<Passkey[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [pending, setPending] = React.useState(false);
	const [reauthOpen, setReauthOpen] = React.useState(false);
	const [currentPassword, setCurrentPassword] = React.useState("");
	const [freshSignInRequired, setFreshSignInRequired] = React.useState(false);
	const [requestedAction, setRequestedAction] =
		React.useState<PendingPasskeyAction | null>(null);

	const load = React.useCallback(async () => {
		setLoading(true);
		try {
			const { data, error } = await createClient().auth.passkey.list();
			if (error) throw error;
			setPasskeys((data ?? []) as Passkey[]);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Could not load passkeys";
			if (!message.includes("passkey_disabled")) toast.error(message);
		} finally {
			setLoading(false);
		}
	}, []);

	React.useEffect(() => {
		let cancelled = false;
		queueMicrotask(() => {
			if (!cancelled) void load();
		});
		return () => {
			cancelled = true;
		};
	}, [load]);

	async function executeAction(
		action: PendingPasskeyAction,
		password?: string,
	) {
		if (action.type === "register") {
			const startResult = await startPasskeyRegistrationAction(password);
			if (!startResult.ok) return startResult;

			const publicKey = parsePasskeyCreationOptions(startResult.data.options);
			const credential = await navigator.credentials.create({ publicKey });
			if (!(credential instanceof PublicKeyCredential)) {
				throw new Error("Passkey registration was cancelled");
			}

			const verifyResult = await verifyPasskeyRegistrationAction(
				startResult.data.challengeId,
				serializePasskeyRegistrationCredential(credential),
				password,
			);
			if (!verifyResult.ok) return verifyResult;

			toast.success("Passkey added");
			await load();
			return verifyResult;
		}

		const deleteResult = await deletePasskeyAction(
			action.passkeyId,
			password,
		);
		if (!deleteResult.ok) return deleteResult;
		setPasskeys((items) =>
			items.filter((item) => item.id !== action.passkeyId),
		);
		toast.success("Passkey removed");
		return deleteResult;
	}

	function requestAction(action: PendingPasskeyAction) {
		setRequestedAction(action);
		setCurrentPassword("");
		setFreshSignInRequired(false);
		setReauthOpen(true);
	}

	async function confirmAndExecute(event: React.FormEvent) {
		event.preventDefault();
		if (!requestedAction) return;
		if (hasPassword && !currentPassword) {
			toast.error("Enter your current password");
			return;
		}

		setPending(true);
		try {
			const result = await executeAction(
				requestedAction,
				hasPassword ? currentPassword : undefined,
			);
			if (!result.ok) {
				if (
					result.code === "fresh_sign_in_required" ||
					result.code === "not_authenticated"
				) {
					setFreshSignInRequired(true);
					return;
				}
				throw new Error(result.message);
			}

			setReauthOpen(false);
			setRequestedAction(null);
			setCurrentPassword("");
		} catch (error) {
			const fallback =
				requestedAction.type === "register"
					? "Could not add passkey"
					: "Could not remove passkey";
			const message = error instanceof Error ? error.message : fallback;
			toast.error(
				message.includes("passkey_disabled")
					? "Passkeys are not enabled for this environment yet."
					: message,
			);
		} finally {
			setPending(false);
		}
	}

	async function restartSignIn() {
		setPending(true);
		try {
			await createClient().auth.signOut();
		} finally {
			window.location.assign(
				`/sign-in?returnUrl=${encodeURIComponent("/settings/account/mfa")}`,
			);
		}
	}

	return (
		<div className="rounded-lg border bg-background p-4 sm:p-5 space-y-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h3 className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" />Passkeys</h3>
					<p className="mt-1 text-sm text-muted-foreground">Sign in with your device biometrics, PIN, or security key.</p>
				</div>
				<Button onClick={() => requestAction({ type: "register" })} disabled={pending}>
					{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Add passkey
				</Button>
			</div>
			{loading ? <p className="text-sm text-muted-foreground">Loading passkeys...</p> : null}
			{!loading && passkeys.length === 0 ? <p className="text-sm text-muted-foreground">No passkeys added yet.</p> : null}
			{passkeys.map((passkey) => (
				<div key={passkey.id} className="flex items-center justify-between gap-3 border-t pt-3">
					<div className="min-w-0 text-sm"><p className="truncate font-medium">{passkey.friendly_name || "Passkey"}</p><p className="text-muted-foreground">Added {new Date(passkey.created_at).toLocaleDateString()}</p></div>
					<Button variant="ghost" size="icon" aria-label="Remove passkey" onClick={() => requestAction({ type: "remove", passkeyId: passkey.id })} disabled={pending}><Trash2 className="h-4 w-4" /></Button>
				</div>
			))}

			<Dialog
				open={reauthOpen}
				onOpenChange={(open) => {
					if (pending) return;
					setReauthOpen(open);
					if (!open) {
						setRequestedAction(null);
						setCurrentPassword("");
						setFreshSignInRequired(false);
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Verify it&apos;s you</DialogTitle>
						<DialogDescription>
							Adding or removing a passkey changes how your account can be
							accessed, so recent authentication is required.
						</DialogDescription>
					</DialogHeader>

					{freshSignInRequired ? (
						<div className="space-y-4">
							<p className="text-sm text-muted-foreground">
								Your last sign-in is too old for this security change. Sign in
								again, then return here to continue.
							</p>
							<DialogFooter>
								<Button type="button" onClick={restartSignIn} disabled={pending}>
									{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
									Sign in again
								</Button>
							</DialogFooter>
						</div>
					) : (
						<form onSubmit={confirmAndExecute} className="space-y-4">
							{hasPassword ? (
								<div className="grid gap-2">
									<Label htmlFor="passkey-current-password">
										Current password
									</Label>
									<Input
										id="passkey-current-password"
										type="password"
										autoComplete="current-password"
										value={currentPassword}
										onChange={(event) => setCurrentPassword(event.target.value)}
										disabled={pending}
										autoFocus
									/>
								</div>
							) : (
								<p className="text-sm text-muted-foreground">
									Continue using your recent social, SSO, or passkey sign-in.
								</p>
							)}

							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									onClick={() => setReauthOpen(false)}
									disabled={pending}
								>
									Cancel
								</Button>
								<Button
									type="submit"
									disabled={pending || (hasPassword && !currentPassword)}
								>
									{pending ? (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									) : null}
									Continue
								</Button>
							</DialogFooter>
						</form>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
