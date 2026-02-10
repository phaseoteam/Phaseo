"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface RedirectUriManagerProps {
	clientId: string;
	initialRedirectUris: string[];
}

export default function RedirectUriManager({
	clientId,
	initialRedirectUris,
}: RedirectUriManagerProps) {
	const [redirectUris, setRedirectUris] = useState<string[]>(initialRedirectUris);
	const [newUri, setNewUri] = useState("");
	const [error, setError] = useState<string | null>(null);

	const isValidUri = (uri: string): boolean => {
		try {
			const url = new URL(uri);
			return url.protocol === "http:" || url.protocol === "https:";
		} catch {
			return false;
		}
	};

	const addUri = () => {
		const trimmedUri = newUri.trim();

		if (!trimmedUri) {
			setError("Please enter a redirect URI");
			return;
		}

		if (!isValidUri(trimmedUri)) {
			setError("Please enter a valid HTTP or HTTPS URL");
			return;
		}

		if (redirectUris.includes(trimmedUri)) {
			setError("This redirect URI already exists");
			return;
		}

		setRedirectUris([...redirectUris, trimmedUri]);
		setNewUri("");
		setError(null);

		toast.success("Redirect URI added successfully");
	};

	const removeUri = (uri: string) => {
		setRedirectUris(redirectUris.filter((u) => u !== uri));

		toast.success("Redirect URI removed successfully");
	};

	return (
		<div className="space-y-4">
			<div className="flex gap-2">
				<Input
					placeholder="https://example.com/auth/callback"
					value={newUri}
					onChange={(e) => {
						setNewUri(e.target.value);
						setError(null);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							addUri();
						}
					}}
				/>
				<Button onClick={addUri} size="sm">
					<Plus className="h-4 w-4 mr-1" />
					Add
				</Button>
			</div>

			{error && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{redirectUris.length === 0 ? (
				<div className="text-sm text-muted-foreground text-center py-4 border-2 border-dashed rounded-md">
					No redirect URIs configured
				</div>
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
								onClick={() => removeUri(uri)}
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
					Redirect URIs must be HTTPS URLs (or HTTP localhost for development).
					Users will be redirected here after authorizing your app.
				</AlertDescription>
			</Alert>
		</div>
	);
}
