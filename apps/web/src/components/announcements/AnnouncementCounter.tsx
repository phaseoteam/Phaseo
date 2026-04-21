"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type AnnouncementCounterProps = {
	initial?: number;
};

export default function AnnouncementCounter({
	initial = 0,
}: AnnouncementCounterProps) {
	const [count, setCount] = useState(initial);

	return (
		<div className="my-6 inline-flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => setCount((current) => current - 1)}
			>
				-
			</Button>
			<span className="min-w-10 text-center text-sm font-medium">{count}</span>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => setCount((current) => current + 1)}
			>
				+
			</Button>
		</div>
	);
}
