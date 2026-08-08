"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
	unenrollMFAAction,
	cleanupUnverifiedMFAAction,
} from "@/app/(dashboard)/settings/account/actions";

import { MFAEnrollmentFlow } from "./MFAEnrollmentFlow";
import { PasskeyManager } from "./PasskeyManager";

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
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";

export default function AccountMFAClient({
	hasPassword,
	mfaEnabled,
	mfaFactorId,
}: {
	hasPassword: boolean;
	mfaEnabled: boolean;
	mfaFactorId: string | null;
}) {
	const router = useRouter();

	const [mfaDialogOpen, setMfaDialogOpen] = React.useState(false);
	const [disablingMFA, setDisablingMFA] = React.useState(false);

	async function handleDisableMFA() {
		if (!mfaFactorId) {
			toast.error("No MFA factor found");
			return;
		}

		setDisablingMFA(true);
		try {
			await toast.promise(unenrollMFAAction(mfaFactorId), {
				loading: "Disabling MFA...",
				success: "Two-factor authentication disabled",
				error: (err: any) => err?.message || "Could not disable MFA",
			});
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
		<div className="space-y-6">
			<section aria-labelledby="authenticator-app-title" className="space-y-3">
				<h2
					id="authenticator-app-title"
					className="font-heading text-base font-medium"
				>
					Authenticator App
				</h2>
				<div className="overflow-hidden rounded-xl border bg-background/40">
					<div className="px-4 py-4">
					<div className="flex items-start justify-between gap-4">
						<div className="min-w-0">
							<h3 className="text-sm font-medium">Two-Factor Authentication</h3>
							<p className="mt-0.5 text-sm text-muted-foreground">
								Require a code from your authenticator app when signing in.
							</p>
						</div>
						{mfaEnabled ? (
							<Badge variant="secondary">Enabled</Badge>
						) : (
							<Button onClick={() => setMfaDialogOpen(true)}>Enable MFA</Button>
						)}
					</div>

					{mfaEnabled ? (
						<div className="flex flex-col gap-3 pt-3 pl-3 sm:flex-row sm:items-center sm:justify-between sm:pl-4">
							<div className="min-w-0">
								<p className="text-xs font-medium">Disable Two-Factor Authentication</p>
								<p className="mt-0.5 text-xs text-muted-foreground">
									Remove the additional sign-in verification from your account.
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
									<AlertDialogFooter>
										<AlertDialogCancel disabled={disablingMFA}>
											Cancel
										</AlertDialogCancel>
										<Button
											variant="destructive"
											onClick={handleDisableMFA}
											disabled={disablingMFA}
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
					) : null}
					</div>
				</div>
			</section>

			<MFAEnrollmentFlow
				open={mfaDialogOpen}
				onOpenChange={handleMFADialogClose}
				onSuccess={handleMFASuccess}
			/>
			<Separator />
			<PasskeyManager hasPassword={hasPassword} />
		</div>
	);
}

