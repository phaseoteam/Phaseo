"use client";

import type { ReactNode } from "react";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { ChatThread } from "@/lib/indexeddb/chats";

export function ChatVirtualMessageList({
	estimatedMessageHeight,
	measureVirtualMessage,
	messages,
	renderMessage,
	totalSize,
	virtualItems,
}: {
	estimatedMessageHeight: number;
	measureVirtualMessage: (node: HTMLDivElement | null) => void;
	messages: ChatThread["messages"];
	renderMessage: (
		message: ChatThread["messages"][number],
		messageIndex: number,
	) => ReactNode;
	totalSize: number;
	virtualItems: VirtualItem[];
}) {
	return (
		<div
			className="relative w-full"
			style={{
				height: `${Math.max(totalSize, estimatedMessageHeight)}px`,
			}}
		>
			{virtualItems.map((virtualItem) => {
				const message = messages[virtualItem.index];
				if (!message) return null;

				return (
					<div
						key={virtualItem.key}
						ref={measureVirtualMessage}
						data-index={virtualItem.index}
						className="absolute left-0 top-0 w-full pb-4"
						style={{
							transform: `translateY(${virtualItem.start}px)`,
						}}
					>
						{renderMessage(message, virtualItem.index)}
					</div>
				);
			})}
		</div>
	);
}
