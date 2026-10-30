"use client";

import { settingsStringKey } from "@/i18n/settings-string-keys";
import { useInvalidatePrivateSettings } from "./PrivateSettingsQuery";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { acceptTeamInviteAction } from "@/app/(dashboard)/settings/teams/actions";
import { localizedSettingsError } from "@/i18n/error-messages";

export default function AcceptInviteDialog({
	currentUserId,
	open,
	onOpenChange,
}: {
	currentUserId?: string;
	open: boolean;
	onOpenChange: (next: boolean) => void;
}) {
	const t = useTranslations("SettingsUI");
	const s = (key: string) => t(settingsStringKey(key) as never);
	const [code, setCode] = useState("");
	const invalidateSettings = useInvalidatePrivateSettings();
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	async function onAccept(e?: React.FormEvent) {
		e?.preventDefault();
		if (!code || !currentUserId) return;
		setLoading(true);
		setMessage(null);
		try {
			// call server action to create a join request
			const res = await acceptTeamInviteAction(code, currentUserId);
			void invalidateSettings();
			if (!res || !res.success)
				throw new Error(res?.error || s("Failed to submit request"));
			setMessage(
				res.requestId
					? `${s("phraseRequestSubmittedID")} ${res.requestId}`
					: s("phraseRequestSubmitted")
			);
			// close after a short delay
			setTimeout(() => onOpenChange(false), 900);
		} catch (err: unknown) {
			setMessage(localizedSettingsError(err, t, "Could not submit request"));
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{s("Request to Join a Workspace")}</DialogTitle>
					<DialogDescription>
						{s("phraseEnterAnInviteCodeToRequestToJoinAWorkspace")}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={onAccept} className="space-y-4">
					<Input
						value={code}
						onChange={(e) => setCode(e.target.value)}
						placeholder={s("Invite code")}
					/>
					{message ? <div className="text-sm">{message}</div> : null}
					<DialogFooter>
						<DialogClose asChild>
							<Button type="button" variant="ghost">
								{s("Cancel")}
							</Button>
						</DialogClose>
						<Button type="submit" disabled={loading}>
							{loading ? s("phraseAccepting") : s("Accept")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
