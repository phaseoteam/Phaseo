"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
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
		key: "chat",
		items: [
			{
				key: "newChat",
				icon: MessageSquarePlus,
				keys: ["Ctrl/Cmd", "Shift", "C"],
			},
			{
				key: "addModel",
				icon: Plus,
				keys: ["Ctrl/Cmd", "Shift", "M"],
			},
			{
				key: "temporaryChat",
				icon: MessageCircleDashed,
				keys: ["Ctrl/Cmd", "Shift", "U"],
			},
			{
				key: "searchChats",
				icon: Search,
				keys: ["Ctrl/Cmd", "K"],
			},
		],
	},
	{
		key: "composer",
		items: [
			{
				key: "commandMenu",
				icon: Keyboard,
				keys: ["/"],
			},
			{
				key: "sendOrQueue",
				icon: SendHorizontal,
				keys: ["Enter"],
			},
			{
				key: "newLine",
				icon: CornerDownLeft,
				keys: ["Shift", "Enter"],
			},
			{
				key: "showShortcuts",
				icon: Keyboard,
				keys: ["Ctrl/Cmd", "/"],
			},
		],
	},
] as const;

function ShortcutKey({ children }: { children: string }) {
	return (
		<kbd className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground shadow-xs sm:h-6 sm:min-w-6 sm:text-[11px]">
			{children}
		</kbd>
	);
}

export function ChatShortcutReference() {
	const t = useTranslations("Product.chat.shortcuts");

	return (
		<div className="grid gap-4 sm:gap-5">
			{CHAT_SHORTCUT_GROUPS.map((group) => (
				<div key={group.key} className="grid gap-2.5">
					<div className="px-2 text-xs font-medium text-muted-foreground">
						{t(`groups.${group.key}`)}
					</div>
					<div className="grid gap-1">
						{group.items.map((item) => {
							const Icon = item.icon;
							return (
								<div
									key={item.key}
									className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 rounded-lg px-2 py-2 hover:bg-muted/70 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
								>
									<div className="row-span-2 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
											<Icon className="h-4 w-4" />
									</div>
									<div className="min-w-0">
										<div className="text-sm font-medium text-foreground">
											{t(`${item.key}Title`)}
										</div>
										<div className="text-xs leading-4 text-muted-foreground">
											{t(`${item.key}Description`)}
										</div>
									</div>
									<div className="flex flex-wrap items-center gap-1 sm:justify-self-end">
										{item.keys.map((key, keyIndex) => (
											<Fragment key={`${item.key}-${key}`}>
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
	const t = useTranslations("Product.chat.shortcuts");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[min(92vw,30rem)] gap-0 overflow-hidden p-0">
				<DialogHeader className="px-5 pb-3 pt-5">
					<div className="flex items-start gap-3">
						<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
							<Keyboard className="h-4 w-4" />
						</div>
						<div className="min-w-0">
							<DialogTitle>{t("dialogTitle")}</DialogTitle>
							<DialogDescription>
								{t("dialogDescription")}
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
