"use client";

import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import RotateKeyItem from "./RotateKeyItem";
import DeleteKeyItem from "./DeleteKeyItem";
import type { KeyDetailData } from "@/lib/fetchers/internal/fetchSettingsKeyDetail";

export function KeyPageActions({ k }: { k: KeyDetailData["key"] }) {
	const router = useRouter();
	return <DropdownMenu>
		<DropdownMenuTrigger asChild><Button variant="outline">Actions</Button></DropdownMenuTrigger>
		<DropdownMenuContent align="end">
			<RotateKeyItem k={k} />
			<DeleteKeyItem k={k} onDeleted={() => router.push("/settings/keys")} />
		</DropdownMenuContent>
	</DropdownMenu>;
}
