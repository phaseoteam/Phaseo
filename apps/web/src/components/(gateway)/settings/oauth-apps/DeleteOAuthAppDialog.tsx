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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface DeleteOAuthAppDialogProps {
	clientId: string;
	appName: string;
}

export default function DeleteOAuthAppDialog({
	clientId,
	appName,
}: DeleteOAuthAppDialogProps) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [confirmation, setConfirmation] = useState("");
	const router = useRouter();

	const handleDelete = async () => {
		if (confirmation !== appName) {
			setError("App name doesn't match");
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const { deleteOAuthAppAction } = await import(
				"@/app/(dashboard)/settings/oauth-apps/actions"
			);

			const result = await deleteOAuthAppAction(clientId);

			if (result.error) {
				setError(result.error);
				return;
			}

			toast.success(`OAuth app "${appName}" deleted successfully`);

			// Navigate back to the list
			router.push("/settings/oauth-apps");
			router.refresh();
		} catch (err: any) {
			setError(err.message || "Failed to delete OAuth app");
		} finally {
			setLoading(false);
		}
	};

	const handleClose = () => {
		setOpen(false);
		setConfirmation("");
		setError(null);
	};

	return (
		<Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
			<DialogTrigger asChild>
				<Button variant="destructive" size="sm">
					<Trash2 className="h-4 w-4 mr-2" />
					Delete App
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete OAuth App</DialogTitle>
					<DialogDescription>
						This will permanently delete <strong>{appName}</strong> and revoke
						all user authorizations.
					</DialogDescription>
				</DialogHeader>

				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>
						<strong>Warning:</strong> This action cannot be undone. All users
						who authorized this app will lose access immediately.
					</AlertDescription>
				</Alert>

				<div className="space-y-2">
					<Label htmlFor="confirmation">
						Type <strong>{appName}</strong> to confirm
					</Label>
					<Input
						id="confirmation"
						value={confirmation}
						onChange={(e) => {
							setConfirmation(e.target.value);
							setError(null);
						}}
						placeholder={appName}
					/>
				</div>

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
						onClick={handleDelete}
						disabled={loading || confirmation !== appName}
					>
						{loading ? "Deleting..." : "Delete App"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
