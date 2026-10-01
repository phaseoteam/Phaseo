"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { updateByokFallbackAction } from "@/app/(dashboard)/settings/byok/actions";
import { localizedSettingsError } from "@/i18n/error-messages";
import { useSettingsWrite } from "../PrivateSettingsQuery";

export default function ByokFallbackToggle({
	initialEnabled,
}: {
	initialEnabled: boolean;
}) {
	const t = useTranslations("SettingsUI");
	const s = (key: string) => t(`strings.${key}` as never);
	const write = useSettingsWrite();
	const [enabled, setEnabled] = React.useState(initialEnabled);
	const [saving, setSaving] = React.useState(false);

	async function handleChange(next: boolean) {
		setEnabled(next);
		setSaving(true);
		const previous = enabled;
		const operation = write(updateByokFallbackAction(next));
		try {
			toast.promise(operation, {
				loading: s("Saving fallback setting..."),
				success: s("Fallback setting updated"),
				error: (err) =>
					localizedSettingsError(err, t, "Failed to update setting"),
			});
			await operation;
		} catch {
			setEnabled(previous);
		} finally {
			setSaving(false);
		}
	}

	return (
		<label className="flex items-center gap-3 text-sm">
			<Switch
				checked={enabled}
				disabled={saving}
				onCheckedChange={handleChange}
			/>
			<span>
				{s("Try fallback BYOK keys after managed providers")}
			</span>
		</label>
	);
}
