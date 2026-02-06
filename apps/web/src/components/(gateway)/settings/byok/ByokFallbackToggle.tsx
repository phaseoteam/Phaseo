"use client";

import React from "react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { updateByokFallbackAction } from "@/app/(dashboard)/settings/byok/actions";

export default function ByokFallbackToggle({
	initialEnabled,
}: {
	initialEnabled: boolean;
}) {
	const [enabled, setEnabled] = React.useState(initialEnabled);
	const [saving, setSaving] = React.useState(false);

	async function handleChange(next: boolean) {
		setEnabled(next);
		setSaving(true);
		try {
			await toast.promise(updateByokFallbackAction(next), {
				loading: "Saving fallback setting...",
				success: "Fallback setting updated",
				error: (err) => err?.message ?? "Failed to update setting",
			});
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
				Fallback to AI Stats credits if a BYOK request fails
			</span>
		</label>
	);
}
