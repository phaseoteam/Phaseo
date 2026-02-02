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
import { Card } from "@/components/ui/card";
import { AlertTriangle, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface RegenerateSecretDialogProps {
	clientId: string;
	appName: string;
}

export default function RegenerateSecretDialog({
	clientId,
	appName,
}: RegenerateSecretDialogProps) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [newSecret, setNewSecret] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const router = useRouter();

	const handleRegenerate = async () => {
		setLoading(true);
		setError(null);

		try {
			const { regenerateClientSecretAction } = await import(
				"@/app/(dashboard)/settings/oauth-apps/actions"
			);

			const result = await regenerateClientSecretAction(clientId);

			if (result.error) {
				setError(result.error);
				return;
			}

			setNewSecret(result.data.client_secret);

			toast.success("Client secret regenerated successfully");

			router.refresh();
		} catch (err: any) {
			setError(err.message || "Failed to regenerate secret");
		} finally {
			setLoading(false);
		}
	};

	const copySecret = () => {
		if (newSecret) {
			navigator.clipboard.writeText(newSecret);
			setCopied(true);
			toast.success("New client secret copied to clipboard");
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const handleClose = () => {
		setOpen(false);
		setNewSecret(null);
		setError(null);
		setCopied(false);
	};

	// If secret was regenerated, show it
	if (newSecret) {
		return (
			<Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
				<DialogTrigger asChild>
					<Button variant="outline" size="sm">
						Regenerate
					</Button>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>New Client Secret</DialogTitle>
						<DialogDescription>
							Save your new secret now. It will not be shown again.
						</DialogDescription>
					</DialogHeader>

					<Alert>
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							<strong>Important:</strong> Copy your new secret now. The old secret has been invalidated.
						</AlertDescription>
					</Alert>

					<div>
						<label className="text-sm font-medium">New Client Secret</label>
						<Card className="p-3 mt-1 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
							<div className="flex items-center justify-between gap-2">
								<code className="text-xs break-all flex-1">{newSecret}</code>
								<Button
									size="sm"
									variant="outline"
									onClick={copySecret}
									className="shrink-0"
								>
									{copied ? (
										<Check className="h-4 w-4" />
									) : (
										<Copy className="h-4 w-4" />
									)}
								</Button>
							</div>
						</Card>
					</div>

					<DialogFooter>
						<Button onClick={handleClose}>Done</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					Regenerate
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Regenerate Client Secret?</DialogTitle>
					<DialogDescription>
						This will invalidate the current secret for <strong>{appName}</strong>.
						Any apps using the old secret will stop working.
					</DialogDescription>
				</DialogHeader>

				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>
						<strong>Warning:</strong> This action cannot be undone. The old secret will be immediately invalidated.
					</AlertDescription>
				</Alert>

				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleRegenerate}
						disabled={loading}
					>
						{loading ? "Regenerating..." : "Regenerate Secret"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
