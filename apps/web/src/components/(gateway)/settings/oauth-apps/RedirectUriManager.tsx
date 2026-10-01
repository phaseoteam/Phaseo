"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";

interface RedirectUriManagerProps {
	clientId: string;
	initialRedirectUris: string[];
}

export default function RedirectUriManager({
	clientId,
	initialRedirectUris,
}: RedirectUriManagerProps) {
	const translate = useTranslations("SettingsUI");
	const t = (key: string, values?: Record<string, unknown>) =>
		translate(
			(key.startsWith("oauthDetail.")
				? key.replace("oauthDetail.", "oauthDetailCopy.")
				: key) as never,
			values as never,
		);
	const [redirectUris, setRedirectUris] = useState<string[]>(initialRedirectUris);
	const [newUri, setNewUri] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const isValidUri = (uri: string): boolean => {
		try {
			const url = new URL(uri);
			return url.protocol === "http:" || url.protocol === "https:";
		} catch {
			return false;
		}
	};

	const persistRedirectUris = async (
		nextRedirectUris: string[],
		successMessage: string,
	) => {
		const previous = redirectUris;
		setSaving(true);
		setError(null);
		setRedirectUris(nextRedirectUris);
		try {
			const { updateRedirectUrisAction } = await import(
				"@/app/(dashboard)/settings/oauth-apps/actions"
			);
			const result = await updateRedirectUrisAction(clientId, nextRedirectUris);
			if (result.error) {
				throw new Error(result.error);
			}
			toast.success(successMessage);
		} catch (err: unknown) {
			setRedirectUris(previous);
			const message =
				localizedSettingsError(
					err,
					translate,
					"Failed to update redirect URIs. Please try again.",
				);
			setError(message);
			toast.error(message);
		} finally {
			setSaving(false);
		}
	};

	const addUri = async () => {
		const trimmedUri = newUri.trim();

		if (!trimmedUri) {
			setError(t("strings.Please enter a redirect URI" as never));
			return;
		}

		if (!isValidUri(trimmedUri)) {
				setError(t("oauthDetail.validRedirect"));
			return;
		}

		if (redirectUris.includes(trimmedUri)) {
				setError(t("oauthDetail.duplicateRedirect"));
			return;
		}

		const next = [...redirectUris, trimmedUri];
		setNewUri("");
		setError(null);
		await persistRedirectUris(next, t("oauthDetail.redirectAdded"));
	};

	const removeUri = async (uri: string) => {
		if (redirectUris.length <= 1) {
				setError(t("oauthDetail.oneRedirect"));
			return;
		}
		const next = redirectUris.filter((u) => u !== uri);
		await persistRedirectUris(next, t("oauthDetail.redirectRemoved"));
	};

	return (
		<div className="space-y-4">
			<div className="flex gap-2">
				<Input
					placeholder="https://example.com/auth/callback"
					value={newUri}
					disabled={saving}
					onChange={(e) => {
						setNewUri(e.target.value);
						setError(null);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							void addUri();
						}
					}}
				/>
				<Button onClick={() => void addUri()} size="sm" disabled={saving}>
					<Plus className="h-4 w-4 mr-1" />
					{saving ? t("oauthDetail.saving") : t("oauthDetail.add")}
				</Button>
			</div>

			{error && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{redirectUris.length === 0 ? (
				<Empty
					size="compact"
					className="rounded-lg border border-dashed border-border/80 p-6"
				>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<AlertCircle className="h-5 w-5" />
						</EmptyMedia>
					<EmptyTitle className="text-base">{t("oauthDetail.noRedirects")}</EmptyTitle>
						<EmptyDescription>
							{t("oauthDetail.redirectEmpty")}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<div className="space-y-2">
					{redirectUris.map((uri) => (
						<div
							key={uri}
							className="flex items-center justify-between p-3 border rounded-md"
						>
							<code className="text-xs flex-1 break-all">{uri}</code>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => void removeUri(uri)}
								disabled={saving}
								className="ml-2 text-red-600 hover:text-red-700"
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					))}
				</div>
			)}

			<Alert>
				<AlertCircle className="h-4 w-4" />
				<AlertDescription>
					{t("oauthDetail.redirectHelp")}
				</AlertDescription>
			</Alert>
		</div>
	);
}
