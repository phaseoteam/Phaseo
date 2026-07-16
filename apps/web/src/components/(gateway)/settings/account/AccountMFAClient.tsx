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
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Loader2, Shield, ShieldCheck } from "lucide-react";

export default function AccountMFAClient({
	mfaEnabled,
	mfaFactorId,
}: {
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
		<div className="space-y-4">
			{!mfaEnabled ? (
				<Empty className="rounded-lg border p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Shield className="h-5 w-5" />
						</EmptyMedia>
						<EmptyTitle>Two-factor authentication is disabled</EmptyTitle>
						<EmptyDescription>
							Require a code from your authenticator app when signing in.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Badge variant="outline">Disabled</Badge>
						<Button onClick={() => setMfaDialogOpen(true)}>Enable MFA</Button>
					</EmptyContent>
				</Empty>
			) : (
				<div className="rounded-lg border bg-background p-4 sm:p-5 space-y-4">
					<div className="flex items-start justify-between gap-4">
						<div className="min-w-0">
							<h3 className="text-sm font-medium flex items-center gap-2">
								<ShieldCheck className="h-4 w-4 text-green-600" />
								Two-factor authentication
							</h3>
							<p className="text-sm text-muted-foreground mt-1">
								Require a code from your authenticator app when signing in.
							</p>
						</div>
						<Badge variant="default" className="bg-green-600">
							Enabled
						</Badge>
					</div>

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
				</div>
			)}

			<MFAEnrollmentFlow
				open={mfaDialogOpen}
				onOpenChange={handleMFADialogClose}
				onSuccess={handleMFASuccess}
			/>
			<PasskeyManager />
		</div>
	);
}

