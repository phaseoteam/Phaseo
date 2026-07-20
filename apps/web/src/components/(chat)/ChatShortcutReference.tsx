"use client";

import { Fragment } from "react";
import {
	CornerDownLeft,
	Keyboard,
	MessageCircleDashed,
	MessageSquarePlus,
	Plus,
	Search,
	SendHorizontal,
} from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export const CHAT_SHORTCUT_GROUPS = [
	{
		label: "Chat",
		items: [
			{
				icon: MessageSquarePlus,
				title: "New chat",
				description: "Start a fresh conversation.",
				keys: ["Ctrl/Cmd", "Shift", "C"],
			},
			{
				icon: Plus,
				title: "Add model",
				description: "Open the model picker for this chat.",
				keys: ["Ctrl/Cmd", "Shift", "M"],
			},
			{
				icon: MessageCircleDashed,
				title: "Temporary chat",
				description: "Toggle temporary chat mode.",
				keys: ["Ctrl/Cmd", "Shift", "U"],
			},
			{
				icon: Search,
				title: "Search chats",
				description: "Search your local chat history.",
				keys: ["Ctrl/Cmd", "K"],
			},
		],
	},
	{
		label: "Composer",
		items: [
			{
				icon: Keyboard,
				title: "Command menu",
				description: "Type slash in the composer to open commands.",
				keys: ["/"],
			},
			{
				icon: SendHorizontal,
				title: "Send or queue",
				description: "Send now, or queue while a response is running.",
				keys: ["Enter"],
			},
			{
				icon: CornerDownLeft,
				title: "New line",
				description: "Insert a line break in the composer.",
				keys: ["Shift", "Enter"],
			},
			{
				icon: Keyboard,
				title: "Shortcuts",
				description: "Show or hide this reference.",
				keys: ["Ctrl/Cmd", "/"],
			},
		],
	},
];

function ShortcutKey({ children }: { children: string }) {
	return (
		<kbd className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground shadow-xs sm:h-6 sm:min-w-6 sm:text-[11px]">
			{children}
		</kbd>
	);
}

export function ChatShortcutReference() {
	return (
		<div className="grid gap-4 sm:gap-5">
			{CHAT_SHORTCUT_GROUPS.map((group) => (
				<div key={group.label} className="grid gap-2.5">
					<div className="px-2 text-xs font-medium text-muted-foreground">
						{group.label}
					</div>
					<div className="grid gap-1">
						{group.items.map((item) => {
							const Icon = item.icon;
							return (
								<div
									key={item.title}
									className="grid grid-cols-1 gap-2 rounded-lg px-2 py-2 hover:bg-muted/70 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3"
								>
									<div className="flex min-w-0 items-center gap-3">
										<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
											<Icon className="h-4 w-4" />
										</div>
										<div className="min-w-0">
											<div className="text-sm font-medium text-foreground">
												{item.title}
											</div>
											<div className="text-xs leading-4 text-muted-foreground">
												{item.description}
											</div>
										</div>
									</div>
									<div className="flex flex-wrap items-center gap-1 pl-11 sm:justify-end sm:pl-0">
										{item.keys.map((key, keyIndex) => (
											<Fragment key={`${item.title}-${key}`}>
												{keyIndex > 0 ? (
													<span className="text-xs text-muted-foreground">
														+
													</span>
												) : null}
												<ShortcutKey>{key}</ShortcutKey>
											</Fragment>
										))}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}

export function ChatShortcutHelpDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[min(92vw,30rem)] gap-0 overflow-hidden p-0">
				<DialogHeader className="px-5 pb-3 pt-5">
					<div className="flex items-start gap-3">
						<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
							<Keyboard className="h-4 w-4" />
						</div>
						<div className="min-w-0">
							<DialogTitle>Keyboard shortcuts</DialogTitle>
							<DialogDescription>
								Fast actions for chat, models, and the composer.
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>
				<Separator />
				<ScrollArea className="max-h-[calc(100dvh-8rem)] sm:max-h-[min(70vh,26rem)]">
					<div className="p-3 sm:p-5">
						<ChatShortcutReference />
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
