import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { FamilyModelItem } from "@/lib/fetchers/families/types";

type Props = {
	modelId: string;
	header: {
		name: string;
		organisation_id: string;
		organisation: { name: string; country_code?: string | null };
	};
	familyMembers: FamilyModelItem[];
};

export default function ModelFamily({ modelId, header, familyMembers }: Props) {
	const locale = useLocale();
	const t = useTranslations("Catalogue.families");
	const statusLabels: Record<string, string> = {
		available: t("statusAvailable"),
		announced: t("statusAnnounced"),
		preview: t("statusPreview"),
		"limited access": t("statusLimitedAccess"),
		withheld: t("statusWithheld"),
		rumoured: t("statusRumoured"),
		deprecated: t("statusDeprecated"),
		retired: t("statusRetired"),
	};
	const dateFormatter = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeZone: "UTC",
	});

	if (!familyMembers.length) {
		return (
			<div className="rounded-lg border p-4 bg-muted/30">
				<p className="text-sm text-muted-foreground">
					{t("noRelatedMembers")}
				</p>
			</div>
		);
	}

	const title = t("modelFamilyTitle", { model: header.name });

	return (
		<section className="space-y-4">
			<h2 className="text-xl font-semibold">{title}</h2>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{familyMembers.map((member) => {
					const isCurrent = member.model_id === modelId;
					const memberPath = `/models/${member.model_id}`;
					const normalizedStatus = member.status?.trim().toLowerCase();
					const releaseDate = member.release_date
						? new Date(member.release_date)
						: null;
					return (
						<div
							key={member.model_id}
							className="rounded-lg border p-4 bg-background shadow-sm"
						>
							<div className="flex items-center justify-between gap-2">
								<div className="min-w-0">
									<div className="font-semibold truncate">
										{member.name}
									</div>
									<div className="text-xs text-muted-foreground truncate">
										{member.organisation?.name ??
											member.organisation_id}
									</div>
								</div>
								{isCurrent ? (
									<span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/30">
										{t("currentModel")}
									</span>
								) : null}
							</div>
							<div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
								<span>
									{t("statusLabel", {
										status: normalizedStatus
											? statusLabels[normalizedStatus] ?? t("statusUnknown")
											: t("statusUnknown"),
									})}
								</span>
								{releaseDate && !Number.isNaN(releaseDate.getTime()) ? (
									<span>
										{t("released", {
											date: dateFormatter.format(releaseDate),
										})}
									</span>
								) : null}
							</div>
							<Link
								href={memberPath}
								className="mt-3 inline-flex text-sm font-medium text-primary underline decoration-transparent hover:decoration-current transition-colors duration-200"
							>
								{t("viewModel")}
							</Link>
						</div>
					);
				})}
			</div>
		</section>
	);
}
