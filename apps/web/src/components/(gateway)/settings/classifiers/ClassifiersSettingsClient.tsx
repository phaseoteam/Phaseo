import type { ReactNode } from "react";
import { Tags } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { SettingsClassifier, SettingsClassifiersInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { formatPercent, formatUsd } from "./classifierForm";

function Notice({ children }: { children: ReactNode }) {
	return <p className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">{children}</p>;
}

export default function ClassifiersSettingsClient({ data }: { data: SettingsClassifiersInitialData }) {
	const t = useTranslations("SettingsUI.classifiers");
	if (!data.workspaceId) return <Notice>{t("selectWorkspace")}</Notice>;
	if (!data.canManageClassifiers) return <Notice>{t("adminsOnly")}</Notice>;
	if (!data.classifiers.length) {
		return (
			<Empty className="rounded-md border border-dashed p-8">
				<EmptyHeader>
					<EmptyMedia variant="icon"><Tags className="h-5 w-5" /></EmptyMedia>
					<EmptyTitle>{t("emptyTitle")}</EmptyTitle>
					<EmptyDescription>{t("emptyBody")}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}
	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">{t("billingNote")}</p>
			<ul className="divide-y rounded-md border">
				{data.classifiers.map((classifier) => <ClassifierRow key={classifier.id} classifier={classifier} />)}
			</ul>
			{data.classifiers.length >= data.limit ? <p className="text-xs text-muted-foreground">{t("limitReached", { limit: data.limit })}</p> : null}
		</div>
	);
}

function ClassifierRow({ classifier }: { classifier: SettingsClassifier }) {
	const t = useTranslations("SettingsUI.classifiers");
	const percent = formatPercent(classifier.sample_rate);
	return (
		<li>
			<Link href={`/settings/classifiers/${classifier.id}`} className="block px-4 py-4 transition-colors hover:bg-muted/20">
				<div className="flex flex-wrap items-center gap-2">
					<p className="truncate text-base font-semibold">{classifier.name}</p>
					<Badge variant={classifier.enabled ? "secondary" : "outline"}>{classifier.enabled ? t("statusOn") : t("statusOff")}</Badge>
				</div>
				{classifier.description ? <p className="mt-1 text-sm text-muted-foreground">{classifier.description}</p> : null}
				<dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
					<div className="flex gap-2"><dt className="text-muted-foreground">{t("listModel")}</dt><dd className="truncate font-mono">{classifier.model}</dd></div>
					<div className="flex gap-2"><dt className="text-muted-foreground">{t("listLabels")}</dt><dd className="truncate font-mono">{classifier.dimensions.map((dimension) => dimension.key).join(", ")}</dd></div>
					<div className="flex gap-2"><dt className="text-muted-foreground">{t("listSampling")}</dt><dd>{classifier.sample_by === "session" ? t("sampledSessions", { percent }) : t("sampledRequests", { percent })}</dd></div>
					<div className="flex gap-2"><dt className="text-muted-foreground">{t("listThisMonth")}</dt><dd>
						{t("spendSummary", { spend: formatUsd(classifier.usage.costUsd), count: classifier.usage.classifications })}
						{" · "}
						{classifier.monthly_budget_usd == null ? t("noBudget") : t("budgetOf", { budget: formatUsd(classifier.monthly_budget_usd) })}
					</dd></div>
				</dl>
			</Link>
		</li>
	);
}
