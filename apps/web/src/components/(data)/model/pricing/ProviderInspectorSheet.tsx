"use client";

import * as React from "react";
import { Dialog as InspectorPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function ProviderInspectorSheet({ ...props }: InspectorPrimitive.Root.Props) {
	return (
		<InspectorPrimitive.Root
			data-slot="provider-inspector-sheet"
			modal={false}
			{...props}
		/>
	);
}

function ProviderInspectorSheetContent({
	className,
	children,
	disableAnimation = false,
	showCloseButton = true,
	...props
}: InspectorPrimitive.Popup.Props & {
	disableAnimation?: boolean;
	showCloseButton?: boolean;
}) {
	const suppressAnimation =
		disableAnimation ||
		(typeof document !== "undefined" &&
			document.documentElement.dataset.providerInspectorSwitching === "true");

	return (
		<InspectorPrimitive.Portal data-slot="provider-inspector-sheet-portal">
			<InspectorPrimitive.Popup
				data-slot="provider-inspector-sheet-content"
				initialFocus={false}
				finalFocus={false}
				className={cn(
					"fixed right-0 top-[calc(var(--site-notice-height,0px)+3.75rem)] bottom-0 z-40 flex w-full flex-col border-l border-t border-zinc-200 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-xl transition duration-200 ease-in-out data-ending-style:translate-x-6 data-ending-style:opacity-0 data-starting-style:translate-x-6 data-starting-style:opacity-0 dark:border-zinc-800",
					suppressAnimation &&
						"!transition-none !duration-0 data-ending-style:!translate-x-0 data-ending-style:!opacity-100 data-starting-style:!translate-x-0 data-starting-style:!opacity-100",
					className,
				)}
				{...props}
			>
				{children}
				{showCloseButton ? (
					<InspectorPrimitive.Close
						data-slot="provider-inspector-sheet-close"
						render={
							<Button
								variant="ghost"
								className="absolute top-4 right-4 bg-secondary"
								size="icon-sm"
							/>
						}
					>
						<XIcon />
						<span className="sr-only">Close</span>
					</InspectorPrimitive.Close>
				) : null}
			</InspectorPrimitive.Popup>
		</InspectorPrimitive.Portal>
	);
}

function ProviderInspectorSheetHeader({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="provider-inspector-sheet-header"
			className={cn("flex flex-col gap-1.5 p-6", className)}
			{...props}
		/>
	);
}

function ProviderInspectorSheetTitle({
	className,
	...props
}: InspectorPrimitive.Title.Props) {
	return (
		<InspectorPrimitive.Title
			data-slot="provider-inspector-sheet-title"
			className={cn("font-heading text-base font-medium text-foreground", className)}
			{...props}
		/>
	);
}

function ProviderInspectorSheetDescription({
	className,
	...props
}: InspectorPrimitive.Description.Props) {
	return (
		<InspectorPrimitive.Description
			data-slot="provider-inspector-sheet-description"
			className={cn("text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

export {
	ProviderInspectorSheet,
	ProviderInspectorSheetContent,
	ProviderInspectorSheetDescription,
	ProviderInspectorSheetHeader,
	ProviderInspectorSheetTitle,
};
