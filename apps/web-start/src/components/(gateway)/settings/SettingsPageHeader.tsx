"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export default function SettingsPageHeader(props: {
	title: string;
	description?: string | null;
	titleKey?: string;
	descriptionKey?: string;
	meta?: React.ReactNode;
	actions?: React.ReactNode;
	className?: string;
}) {
	const { title, description, meta, actions, className } = props;
	const t = useTranslations("SettingsUI");
	const translatedTitle = props.titleKey ? t(props.titleKey as never) : title;
	const translatedDescription = props.descriptionKey
		? t(props.descriptionKey as never)
		: description;

	return (
		<div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<h1 className="text-2xl font-semibold tracking-tight">{translatedTitle}</h1>
					{meta ? <div className="shrink-0">{meta}</div> : null}
				</div>
				{description ? (
					<p className="mt-1 text-sm text-muted-foreground">{translatedDescription}</p>
				) : null}
			</div>
			{actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
		</div>
	);
}
