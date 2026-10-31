import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n/react";

export function AIGeneratedNotice({ className }: { className?: string }) {
	const t = useTranslations("Product.chatRooms.aiElements");
	return (
		<p
			role="note"
			className={cn(
				"text-center text-[11px] leading-4 text-muted-foreground",
				className,
			)}
		>
			{t("aiGeneratedNotice")}
		</p>
	);
}
