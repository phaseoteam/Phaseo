"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setAdminModelAvailability } from "@/lib/fetchers/internal/adminModelEditorClient";

export function ModelAvailabilityControl({ modelId, hidden, onChanged }: {
	modelId: string;
	hidden: boolean;
	onChanged: (available: boolean) => void;
}) {
	const router = useRouter();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [available, setAvailable] = useState(!hidden);
	useEffect(() => setAvailable(!hidden), [hidden]);

	async function update() {
		setPending(true);
		setError(null);
		try {
			const result = await setAdminModelAvailability(modelId, !available);
			setAvailable(result.available);
			onChanged(result.available);
			router.refresh();
		} catch (error) {
			setError(error instanceof Error ? error.message : "Availability update failed");
		} finally {
			setPending(false);
		}
	}

	return <div className="space-y-2">
		<Button type="button" variant="outline" disabled={pending} onClick={update}>
			{pending ? "Updating…" : available ? "Make internal" : "Release model"}
		</Button>
		{error && <p className="text-sm text-destructive" role="alert">{error}</p>}
	</div>;
}
