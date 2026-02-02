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
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, AlertCircle, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";

interface CreateOAuthAppDialogProps {
	currentUserId: string;
	currentTeamId: string | null;
	teams: any[];
}

export default function CreateOAuthAppDialog({
	currentUserId,
	currentTeamId,
	teams,
}: CreateOAuthAppDialogProps) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [createdApp, setCreatedApp] = useState<any>(null);
	const [copiedSecret, setCopiedSecret] = useState(false);
	const router = useRouter();

	const [formData, setFormData] = useState({
		name: "",
		description: "",
		homepageUrl: "",
		redirectUris: "http://localhost:3000/auth/callback",
	});

	const handleCreate = async () => {
		setLoading(true);
		setError(null);

		try {
			// Import the action dynamically to avoid bundling issues
			const { createOAuthAppAction } = await import("@/app/(dashboard)/settings/oauth-apps/actions");

			const result = await createOAuthAppAction({
				name: formData.name,
				description: formData.description || undefined,
				homepage_url: formData.homepageUrl || undefined,
				redirect_uris: formData.redirectUris.split("\n").filter(uri => uri.trim()),
				team_id: currentTeamId!,
			});

			if (result.error) {
				setError(result.error);
				return;
			}

			// Show the created app with client secret (only shown once!)
			setCreatedApp(result.data);

			toast.success(`OAuth app "${formData.name}" created successfully`);

			// Refresh the page data
			router.refresh();
		} catch (err: any) {
			setError(err.message || "Failed to create OAuth app");
		} finally {
			setLoading(false);
		}
	};

	const handleClose = () => {
		setOpen(false);
		setFormData({
			name: "",
			description: "",
			homepageUrl: "",
			redirectUris: "http://localhost:3000/auth/callback",
		});
		setCreatedApp(null);
		setError(null);
		setCopiedSecret(false);
	};

	const copySecret = () => {
		if (createdApp?.client_secret) {
			navigator.clipboard.writeText(createdApp.client_secret);
			setCopiedSecret(true);
			toast.success("Client secret copied to clipboard");
			setTimeout(() => setCopiedSecret(false), 2000);
		}
	};

	// If app was just created, show the credentials screen
	if (createdApp) {
		return (
			<Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
				<DialogTrigger asChild>
					<Button>
						<Plus className="h-4 w-4 mr-2" />
						Create OAuth App
					</Button>
				</DialogTrigger>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>OAuth App Created</DialogTitle>
						<DialogDescription>
							Save your client credentials now. The client secret will not be shown again.
						</DialogDescription>
					</DialogHeader>

					<Alert>
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>
							<strong>Important:</strong> Copy your client secret now. You won&apos;t be able to see it again!
						</AlertDescription>
					</Alert>

					<div className="space-y-4">
						<div>
							<Label>Application Name</Label>
							<div className="text-sm font-medium mt-1">{createdApp.name}</div>
						</div>

						<div>
							<Label>Client ID</Label>
							<Card className="p-3 mt-1">
								<code className="text-xs break-all">{createdApp.client_id}</code>
							</Card>
						</div>

						<div>
							<Label>Client Secret</Label>
							<Card className="p-3 mt-1 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
								<div className="flex items-center justify-between gap-2">
									<code className="text-xs break-all flex-1">{createdApp.client_secret}</code>
									<Button
										size="sm"
										variant="outline"
										onClick={copySecret}
										className="shrink-0"
									>
										{copiedSecret ? (
											<Check className="h-4 w-4" />
										) : (
											<Copy className="h-4 w-4" />
										)}
									</Button>
								</div>
							</Card>
							<p className="text-xs text-muted-foreground mt-1">
								Store this securely. It won&apos;t be shown again.
							</p>
						</div>

						<div>
							<Label>Redirect URIs</Label>
							<div className="text-sm text-muted-foreground mt-1">
								{createdApp.redirect_uris?.join(", ") || "None"}
							</div>
						</div>
					</div>

					<DialogFooter>
						<Button onClick={handleClose} variant="default">
							Done
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<Plus className="h-4 w-4 mr-2" />
					Create OAuth App
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Create OAuth App</DialogTitle>
					<DialogDescription>
						Create a new OAuth application for third-party integrations.
						You&apos;ll receive a client ID and secret to use in your application.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div>
						<Label htmlFor="name">
							Application Name <span className="text-red-500">*</span>
						</Label>
						<Input
							id="name"
							placeholder="My Awesome App"
							value={formData.name}
							onChange={(e) =>
								setFormData({ ...formData, name: e.target.value })
							}
							maxLength={100}
						/>
						<p className="text-xs text-muted-foreground mt-1">
							A friendly name for your OAuth application
						</p>
					</div>

					<div>
						<Label htmlFor="description">Description</Label>
						<Textarea
							id="description"
							placeholder="Describe what your app does..."
							value={formData.description}
							onChange={(e) =>
								setFormData({ ...formData, description: e.target.value })
							}
							rows={3}
						/>
					</div>

					<div>
						<Label htmlFor="homepageUrl">Homepage URL</Label>
						<Input
							id="homepageUrl"
							type="url"
							placeholder="https://example.com"
							value={formData.homepageUrl}
							onChange={(e) =>
								setFormData({ ...formData, homepageUrl: e.target.value })
							}
						/>
					</div>

					<div>
						<Label htmlFor="redirectUris">
							Redirect URIs <span className="text-red-500">*</span>
						</Label>
						<Textarea
							id="redirectUris"
							placeholder="https://example.com/auth/callback&#10;http://localhost:3000/auth/callback"
							value={formData.redirectUris}
							onChange={(e) =>
								setFormData({ ...formData, redirectUris: e.target.value })
							}
							rows={4}
						/>
						<p className="text-xs text-muted-foreground mt-1">
							One URI per line. Users will be redirected here after authorization.
						</p>
					</div>

					{error && (
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						onClick={handleCreate}
						disabled={loading || !formData.name.trim() || !formData.redirectUris.trim()}
					>
						{loading ? "Creating..." : "Create App"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
