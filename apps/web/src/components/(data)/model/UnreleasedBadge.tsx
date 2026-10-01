"use client";

import { FlaskConical } from "lucide-react";

export default function UnreleasedBadge({ compact = false }: { compact?: boolean }) {
	return (
		<span
			role="img"
			aria-label="Unreleased model"
			title="Unreleased model"
			className={`inline-flex shrink-0 items-center justify-center text-blue-400 ${compact ? "size-4" : "size-5"}`}
		>
			<FlaskConical className={compact ? "size-3.5" : "size-4"} aria-hidden="true" />
		</span>
	);
}
