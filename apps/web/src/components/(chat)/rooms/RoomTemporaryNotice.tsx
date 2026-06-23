"use client";

import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type RoomTemporaryNoticeProps = {
	className?: string;
};

export function RoomTemporaryNotice({ className }: RoomTemporaryNoticeProps) {
	return (
		<div
			className={cn(
				"rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-100",
				className,
			)}
		>
			<div className="flex items-start gap-2">
				<MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
				<div>
					<p className="font-medium">Temporary chat</p>
					<p className="text-xs text-amber-800/80 dark:text-amber-100/75">
						This conversation will not be saved in your local chat history.
					</p>
				</div>
			</div>
		</div>
	);
}
