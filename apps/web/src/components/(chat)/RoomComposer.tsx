import type { ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { Check, Plus, type LucideIcon } from "lucide-react";
import { AIGeneratedNotice } from "@/components/(chat)/AIGeneratedNotice";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type RoomComposerTool = {
	id: string;
	label: string;
	icon: LucideIcon;
	active?: boolean;
	disabled?: boolean;
	onSelect: () => void;
};

export function RoomComposerToolsMenu({ tools }: { tools: RoomComposerTool[] }) {
	const t = useTranslations("Common.ui.accessibility");
	if (tools.length === 0) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					aria-label={t("openActionMenu")}
					data-chat-room-tools-trigger="true" />}>

					<Plus className="h-4 w-4" />

			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="start" sideOffset={8} className="w-52 rounded-md [&_[data-slot=dropdown-menu-item]]:rounded-md">
				{tools.map((tool) => {
					const Icon = tool.icon;
					return (
						<DropdownMenuItem
							key={tool.id}
							disabled={tool.disabled}
							onClick={tool.onSelect}
							className="gap-2"
						>
							<Icon className="h-4 w-4 text-muted-foreground" />
							<span>{tool.label}</span>
							{tool.active ? <Check className="ml-auto h-4 w-4" /> : null}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function RoomComposerFooter({
	children,
	className,
	...props
}: ComponentProps<"footer">) {
	return (
		<footer
			data-chat-composer-footer="true"
			className={cn(
				"border-t border-border bg-background px-4 py-[15px] md:px-8",
				className,
			)}
			{...props}
		>
			{children}
			<AIGeneratedNotice className="mt-1" />
		</footer>
	);
}

export function RoomComposerSurface({
	className,
	...props
}: ComponentProps<"div">) {
	return (
		<div
			data-chat-composer-surface="true"
			className={cn(
				"rounded-md border border-border bg-card shadow-sm transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
				className,
			)}
			{...props}
		/>
	);
}
