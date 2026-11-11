import * as React from "react";
import { useTranslations } from "@/i18n/react";

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
		<header className={cn("flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between", className)}>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<h1 className="break-words text-2xl font-semibold tracking-tight">{translatedTitle}</h1>
					{meta ? <div className="shrink-0">{meta}</div> : null}
				</div>
				{translatedDescription ? (
					<p className="mt-1 max-w-3xl text-sm text-muted-foreground">{translatedDescription}</p>
				) : null}
			</div>
			{actions ? <div className="flex max-w-full flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
		</header>
	);
}
