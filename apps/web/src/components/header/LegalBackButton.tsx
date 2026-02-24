"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function LegalBackButton() {
	const router = useRouter();

	function handleBack() {
		if (window.history.length > 1) {
			router.back();
			return;
		}
		router.push("/");
	}

	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			onClick={handleBack}
			className="h-8 gap-1.5 px-2.5 text-xs text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
			aria-label="Go back"
		>
			<ArrowLeft className="h-3.5 w-3.5" />
			Back
		</Button>
	);
}
