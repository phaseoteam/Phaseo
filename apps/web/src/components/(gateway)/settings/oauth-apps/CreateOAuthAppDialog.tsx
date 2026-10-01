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
import OAuthScopeSelector from "./OAuthScopeSelector";
import { DEFAULT_THIRD_PARTY_OAUTH_SCOPES } from "@/lib/oauth/scopes";
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";

interface CreateOAuthAppDialogProps {
	currentTeamId: string | null;
}

export default function CreateOAuthAppDialog({
	currentTeamId,
}: CreateOAuthAppDialogProps) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [createdApp, setCreatedApp] = useState<any>(null);
	const [copiedSecret, setCopiedSecret] = useState(false);
	const router = useRouter();
	const t = useTranslations("SettingsUI");

	const [formData, setFormData] = useState({
		name: "",
		description: "",
		homepageUrl: "",
		redirectUris: "http://localhost:3000/auth/callback",
		allowedScopes: [...DEFAULT_THIRD_PARTY_OAUTH_SCOPES] as string[],
	});

	const handleCreate = async () => {
		if (!currentTeamId) {
			setError(t("strings.selectWorkspace" as never));
			return;
		}
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
				workspace_id: currentTeamId!,
				allowed_scopes: formData.allowedScopes,
			});

			if (result.error) {
				setError(localizedSettingsError(result.error, t, "Failed to create OAuth app"));
				return;
			}

			// Show the created app with client secret (only shown once!)
			setCreatedApp(result.data);

			toast.success(`${t("strings.OAuth app" as never)} "${formData.name}" ${t("strings.created successfully" as never)}`);

			// Refresh the page data
			router.refresh();
		} catch (err: any) {
			setError(localizedSettingsError(err, t, "Failed to create OAuth app"));
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
			allowedScopes: [...DEFAULT_THIRD_PARTY_OAUTH_SCOPES] as string[],
		});
		setCreatedApp(null);
		setError(null);
		setCopiedSecret(false);
	};

	const copySecret = () => {
		if (createdApp?.client_secret) {
			navigator.clipboard.writeText(createdApp.client_secret);
			setCopiedSecret(true);
			toast.success(t("strings.Client secret copied to clipboard" as never));
			setTimeout(() => setCopiedSecret(false), 2000);
		}
	};

	// If app was just created, show the credentials screen
	if (createdApp) {
		return (
			<Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
				<DialogTrigger asChild>
					<Button disabled={!currentTeamId}>
						<Plus className="h-4 w-4 mr-2" />
						{t("strings.Create OAuth App" as never)}
					</Button>
				</DialogTrigger>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
				<DialogTitle>{t("strings.OAuth App Created" as never)}</DialogTitle>
						<DialogDescription>
				{t("strings.Save your client credentials now. The client secret will not be shown again." as never)}
						</DialogDescription>
					</DialogHeader>

					<Alert>
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>
				<strong>{t("strings.Important:" as never)}</strong> {t("strings.Copy your client secret now. You won&apos;t be able to see it again!" as never)}
						</AlertDescription>
					</Alert>

					<div className="space-y-4">
						<div>
				<Label>{t("strings.Application Name" as never)}</Label>
							<div className="text-sm font-medium mt-1">{createdApp.name}</div>
						</div>

						<div>
				<Label>{t("strings.Client ID" as never)}</Label>
							<Card className="p-3 mt-1">
								<code className="text-xs break-all">{createdApp.client_id}</code>
							</Card>
						</div>

						<div>
				<Label>{t("strings.Client Secret" as never)}</Label>
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
								{t("oauthCopy.createdSecretNotice")}
							</p>
						</div>

						<div>
				<Label>{t("oauth.redirectUri")}</Label>
							<div className="text-sm text-muted-foreground mt-1">
								{createdApp.redirect_uris?.join(", ") || t("strings.None" as never)}
							</div>
						</div>
					</div>

					<DialogFooter>
						<Button onClick={handleClose} variant="default">
								{t("labels.done")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button disabled={!currentTeamId}>
					<Plus className="h-4 w-4 mr-2" />
						{t("strings.Create OAuth App" as never)}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
				<DialogHeader>
				<DialogTitle>{t("strings.Create OAuth App" as never)}</DialogTitle>
					<DialogDescription>
					{t("strings.Create a new OAuth application for third-party integrations." as never)}
						{t("oauthCopy.clientCredentialsDescription")}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div>
						<Label htmlFor="name">
							{t("oauthCopy.applicationName")} <span className="text-red-500">*</span>
						</Label>
						<Input
							id="name"
							placeholder={t("oauthCopy.applicationNamePlaceholder")}
							value={formData.name}
							onChange={(e) =>
								setFormData({ ...formData, name: e.target.value })
							}
							maxLength={100}
						/>
						<p className="text-xs text-muted-foreground mt-1">
							{t("oauthCopy.applicationNameHelp")}
						</p>
					</div>

					<div>
					<Label>{t("strings.Scopes this app may request" as never)}</Label>
						<p className="mb-3 text-xs text-muted-foreground">
							{t("oauthCopy.minimumScopesHelp")}
						</p>
						<OAuthScopeSelector
							selectedScopes={formData.allowedScopes}
							onChange={(allowedScopes) => setFormData({ ...formData, allowedScopes })}
						/>
					</div>

					<div>
					<Label htmlFor="description">{t("strings.Description" as never)}</Label>
						<Textarea
							id="description"
							placeholder={t("oauthCopy.descriptionPlaceholder")}
							value={formData.description}
							onChange={(e) =>
								setFormData({ ...formData, description: e.target.value })
							}
							rows={3}
						/>
					</div>

					<div>
					<Label htmlFor="homepageUrl">{t("strings.Homepage URL" as never)}</Label>
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
							{t("oauthCopy.redirectUrisLabel")} <span className="text-red-500">*</span>
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
							{t("oauthCopy.redirectUrisHelp")}
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
							{t("labels.cancel")}
					</Button>
					<Button
						onClick={handleCreate}
						disabled={loading || !formData.name.trim() || !formData.redirectUris.trim() || formData.allowedScopes.length === 0}
					>
							{loading ? t("labels.creating") : t("strings.Create App" as never)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
