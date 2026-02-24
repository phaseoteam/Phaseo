import Link from "next/link";
import { FamilyModelItem } from "@/lib/fetchers/models/getFamilyModels";

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
	if (!familyMembers.length) {
		return (
			<div className="rounded-lg border p-4 bg-muted/30">
				<p className="text-sm text-muted-foreground">
					No related family members found for this model yet.
				</p>
			</div>
		);
	}

	const title = `${header.name} family`;

	return (
		<section className="space-y-4">
			<h2 className="text-xl font-semibold">{title}</h2>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{familyMembers.map((member) => {
					const isCurrent = member.model_id === modelId;
					const memberPath = `/models/${member.model_id}`;
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
										Current
									</span>
								) : null}
							</div>
							<div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
								<span>
									Status: {member.status ?? "Unknown"}
								</span>
								{member.release_date ? (
									<span>
										Released:{" "}
										{member.release_date.split("T")[0]}
									</span>
								) : null}
							</div>
							<Link
								href={memberPath}
								className="mt-3 inline-flex text-sm font-medium text-primary underline decoration-transparent hover:decoration-current transition-colors duration-200"
							>
								View model
							</Link>
						</div>
					);
				})}
			</div>
		</section>
	);
}

