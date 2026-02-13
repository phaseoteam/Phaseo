"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
	unenrollMFAAction,
	cleanupUnverifiedMFAAction,
} from "@/app/(dashboard)/settings/account/actions";

import { MFAEnrollmentFlow } from "./MFAEnrollmentFlow";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Shield, ShieldCheck } from "lucide-react";

export default function AccountMFAClient({
	mfaEnabled,
	mfaFactorId,
	hasPassword,
}: {
	mfaEnabled: boolean;
	mfaFactorId: string | null;
	hasPassword: boolean;
}) {
	const router = useRouter();

	const [mfaDialogOpen, setMfaDialogOpen] = React.useState(false);
	const [disablingMFA, setDisablingMFA] = React.useState(false);
	const [mfaDisablePassword, setMfaDisablePassword] = React.useState("");

	async function handleDisableMFA() {
		if (!mfaFactorId) {
			toast.error("No MFA factor found");
			return;
		}

		if (hasPassword && !mfaDisablePassword) {
			toast.error("Password is required");
			return;
		}

		setDisablingMFA(true);
		try {
			await toast.promise(unenrollMFAAction(mfaFactorId, mfaDisablePassword), {
				loading: "Disabling MFA...",
				success: "Two-factor authentication disabled",
				error: (err: any) => err?.message || "Could not disable MFA",
			});
			setMfaDisablePassword("");
			router.refresh();
		} catch (e) {
			void e;
		} finally {
			setDisablingMFA(false);
		}
	}

	function handleMFASuccess() {
		toast.success("MFA enabled successfully!");
		setTimeout(() => router.refresh(), 750);
	}

	async function handleMFADialogClose(open: boolean) {
		setMfaDialogOpen(open);
		if (!open && !mfaEnabled) {
			try {
				await cleanupUnverifiedMFAAction();
			} catch {
				// ignore
			}
			router.refresh();
		}
	}

	return (
		<div className="rounded-lg border bg-background p-4 sm:p-5 space-y-4">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<h3 className="text-sm font-medium flex items-center gap-2">
						{mfaEnabled ? (
							<ShieldCheck className="h-4 w-4 text-green-600" />
						) : (
							<Shield className="h-4 w-4" />
						)}
						Two-factor authentication
					</h3>
					<p className="text-sm text-muted-foreground mt-1">
						Require a code from your authenticator app when signing in.
					</p>
				</div>
				{mfaEnabled ? (
					<Badge variant="default" className="bg-green-600">
						Enabled
					</Badge>
				) : (
					<Badge variant="outline">Disabled</Badge>
				)}
			</div>

			{!mfaEnabled ? (
				<div className="flex justify-end">
					<Button onClick={() => setMfaDialogOpen(true)}>Enable MFA</Button>
				</div>
			) : (
				<div className="flex items-center justify-between gap-4">
					<div>
						<p className="text-sm font-medium">Disable MFA</p>
						<p className="text-sm text-muted-foreground">
							Remove two-factor authentication from your account.
						</p>
					</div>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="outline">Disable</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Disable MFA?</AlertDialogTitle>
								<AlertDialogDescription>
									This will remove the extra security layer from your account.
								</AlertDialogDescription>
							</AlertDialogHeader>

							{hasPassword ? (
								<div className="grid gap-3 py-4">
									<div className="grid gap-2">
										<Label htmlFor="mfaDisablePassword">Confirm with password</Label>
										<Input
											id="mfaDisablePassword"
											type="password"
											value={mfaDisablePassword}
											onChange={(e) => setMfaDisablePassword(e.target.value)}
											placeholder="Enter your password"
											autoFocus
										/>
									</div>
								</div>
							) : null}

							<AlertDialogFooter>
								<AlertDialogCancel disabled={disablingMFA}>
									Cancel
								</AlertDialogCancel>
								<Button
									variant="destructive"
									onClick={handleDisableMFA}
									disabled={(hasPassword && !mfaDisablePassword) || disablingMFA}
								>
									{disablingMFA ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Disabling...
										</>
									) : (
										"Disable MFA"
									)}
								</Button>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			)}

			<MFAEnrollmentFlow
				open={mfaDialogOpen}
				onOpenChange={handleMFADialogClose}
				onSuccess={handleMFASuccess}
			/>
		</div>
	);
}

