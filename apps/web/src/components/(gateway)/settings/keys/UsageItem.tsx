"use client";

import React from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { BarChart2 } from "lucide-react";
import Link from "next/link";

export default function UsageItem({ k }: any) {
	// Navigate to the dashboard usage page, scoped to this key
	const href = `/settings/usage?key=${encodeURIComponent(k.id)}`;

	return (
		<DropdownMenuItem asChild>
			<Link
				className="w-full text-left flex items-center gap-2"
				href={href}
			>
				<BarChart2 className="mr-2" />
				Usage
			</Link>
		</DropdownMenuItem>
	);
}
