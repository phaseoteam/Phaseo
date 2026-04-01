"use client";

import { AlertCircle } from "lucide-react";
import { formatRoomError } from "@/lib/chat/formatRoomError";
import { cn } from "@/lib/utils";

type RoomErrorNoticeProps = {
	error: string;
	className?: string;
};

export function RoomErrorNotice({ error, className }: RoomErrorNoticeProps) {
	const formatted = formatRoomError(error);
	return (
		<div
			role="alert"
			className={cn(
				"rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2",
				className,
			)}
		>
			<div className="flex items-start gap-2">
				<AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
				<div className="min-w-0 space-y-0.5">
					<p className="text-xs font-medium text-destructive">{formatted.title}</p>
					<p className="break-words text-xs text-destructive/90">
						{formatted.message}
					</p>
					{formatted.hint ? (
						<p className="break-words text-[11px] text-muted-foreground">
							{formatted.hint}
						</p>
					) : null}
					{formatted.statusCode || formatted.generationId ? (
						<p className="text-[11px] text-muted-foreground">
							{formatted.statusCode ? `Status ${formatted.statusCode}` : null}
							{formatted.statusCode && formatted.generationId ? " · " : null}
							{formatted.generationId ? `ID ${formatted.generationId}` : null}
						</p>
					) : null}
				</div>
			</div>
		</div>
	);
}

