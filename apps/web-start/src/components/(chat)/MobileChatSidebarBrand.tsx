"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

export function MobileChatSidebarBrand() {
	const t = useTranslations("Common.nav");
	return (
		<Link
			href="/"
			aria-label={`Phaseo · ${t("home")}`}
			className="ml-2 inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
		>
			<Image src="/logo_light.svg" alt="" width={24} height={24} className="size-6 object-contain dark:hidden" />
			<Image src="/logo_dark.svg" alt="" width={24} height={24} className="hidden size-6 object-contain dark:block" />
		</Link>
	);
}

export function MobileChatSidebarTrigger() {
	const t = useTranslations("Product.chatRooms");
	const { state, toggleSidebar } = useSidebar();
	const isOpen = state === "expanded";

	return (
		<Button
			variant="ghost"
			size="icon-sm"
			className="ml-auto mr-2 md:hidden"
			onClick={toggleSidebar}
			aria-label={isOpen ? t("collapseSidebar") : t("openSidebar")}
		>
			{isOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
		</Button>
	);
}
