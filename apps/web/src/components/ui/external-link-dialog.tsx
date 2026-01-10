"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { isExternalLink } from "@/lib/utils";

interface ExternalLinkDialogProps {
	href: string;
	children: React.ReactNode;
	className?: string;
	external?: boolean;
}

export function ExternalLinkDialog({
	href,
	children,
	className,
	external: explicitlyExternal,
}: ExternalLinkDialogProps) {
	const [isOpen, setIsOpen] = React.useState(false);
	const isExternal = explicitlyExternal ?? isExternalLink(href);

	if (!isExternal) {
		return (
			<Link href={href} className={className}>
				{children}
			</Link>
		);
	}

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<span className={className}>{children}</span>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AlertTriangle className="h-5 w-5 text-amber-500" />
						External Link Warning
					</DialogTitle>
					<DialogDescription>
						You are about to leave our website. While we try to verify every link
						on our website, we cannot guarantee the content or security of external
						sites. You click at your own risk.
					</DialogDescription>
				</DialogHeader>
				<div className="text-sm text-zinc-500 dark:text-zinc-400 break-all">
					{href}
				</div>
				<DialogFooter className="sm:justify-between gap-2">
					<Button
						variant="outline"
						onClick={() => setIsOpen(false)}
						className="flex-1 sm:flex-none"
					>
						Cancel
					</Button>
					<Button
						onClick={() => {
							setIsOpen(false);
							window.open(href, "_blank", "noopener,noreferrer");
						}}
						className="flex-1 sm:flex-none"
					>
						Continue
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
