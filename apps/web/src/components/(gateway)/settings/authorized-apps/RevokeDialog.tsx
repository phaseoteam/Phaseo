"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";

interface RevokeDialogProps {
	authorizationId: string;
	appName: string;
}

export default function RevokeDialog({
	authorizationId,
	appName,
}: RevokeDialogProps) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();

	const handleRevoke = async () => {
		setLoading(true);
		setError(null);

		try {
			const { revokeAuthorizationAction } = await import(
				"@/app/(dashboard)/settings/authorized-apps/actions"
			);

			const result = await revokeAuthorizationAction(authorizationId);

			if (result.error) {
				setError(result.error);
				return;
			}

			toast.success(`Access revoked for "${appName}"`);

			setOpen(false);
			router.refresh();
		} catch (err: any) {
			setError(err.message || "Failed to revoke access");
		} finally {
			setLoading(false);
		}
	};

	const handleClose = () => {
		setOpen(false);
		setError(null);
	};

	return (
		<Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" className="shrink-0">
					<X className="h-4 w-4 mr-1" />
					Revoke Access
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Revoke Access?</DialogTitle>
					<DialogDescription>
						This will immediately prevent <strong>{appName}</strong> from
						accessing your AI Stats account. Any active tokens will be
						invalidated.
					</DialogDescription>
				</DialogHeader>

				<Alert>
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>
						The application will no longer be able to make API requests on
						your behalf. You can re-authorize the app later if needed.
					</AlertDescription>
				</Alert>

				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={handleClose}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleRevoke}
						disabled={loading}
					>
						{loading ? "Revoking..." : "Revoke Access"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
