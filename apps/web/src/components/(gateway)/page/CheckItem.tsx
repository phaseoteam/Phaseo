import React from "react";
import { CheckCircle2 } from "lucide-react";

export default function CheckItem({ children }: { children: React.ReactNode }) {
	return (
		<li className="flex items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
			<CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600 dark:text-emerald-400" />
			<span>{children}</span>
		</li>
	);
}
