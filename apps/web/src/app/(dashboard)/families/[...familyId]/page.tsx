import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { buildMetadata } from "@/lib/seo";
import {
	getFamilyModelsCached,
	type FamilyModelItem,
} from "@/lib/fetchers/models/getFamilyModels";

const STATUS_STYLES: Record<string, string> = {
	Available:
		"border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
	Announced: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
	Rumoured:
		"border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	Deprecated:
		"border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-300",
	Retired:
		"border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
	default: "border-muted bg-muted/30 text-muted-foreground",
};

function parseFamilyId(input: string[] | string | undefined): string {
	if (!input) return "";
	return Array.isArray(input) ? input.join("/") : input;
}

async function fetchFamily(familyId: string) {
	try {
		return await getFamilyModelsCached(familyId, false);
	} catch (error) {
		console.warn("[seo] failed to load family metadata", {
			familyId,
			error,
		});
		return null;
	}
}

export async function generateMetadata(props: {
	params: Promise<{ familyId: string[] }>;
}): Promise<Metadata> {
	const { familyId: rawFamilyId } = await props.params;
	const familyId = parseFamilyId(rawFamilyId);
	const family = await fetchFamily(familyId);
	const path = `/families/${familyId}`;

	if (!family) {
		return buildMetadata({
			title: "AI Model Family",
			description:
				"Explore related AI models within a family and track release timelines on AI Stats.",
			path,
			keywords: ["AI model family", "AI models", "AI Stats"],
		});
	}

	const description = `${family.family_name} family on AI Stats. Explore ${family.models.length} related models and their release timelines.`;

	return buildMetadata({
		title: `${family.family_name} Family - Related AI Models`,
		description,
		path,
		keywords: [
			family.family_name,
			`${family.family_name} family`,
			"AI model family",
			"AI Stats",
		],
	});
}

function sortMembers(members: FamilyModelItem[]) {
	return [...members].sort((a, b) => a.name.localeCompare(b.name));
}

export default async function Page({
	params,
}: {
	params: Promise<{ familyId: string[] }>;
}) {
	const { familyId: rawFamilyId } = await params;
	const familyId = parseFamilyId(rawFamilyId);
	const family = await getFamilyModelsCached(familyId, false);

	if (!family) {
		notFound();
	}

	const orgId = familyId.split("/")[0] ?? null;
	const members = sortMembers(family.models ?? []);

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8 space-y-6">
				<Card>
					<CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
						<div className="flex items-center gap-4">
							<div className="w-12 h-12 rounded-xl border bg-background flex items-center justify-center">
								<div className="relative w-7 h-7">
									{orgId ? (
										<Logo
											id={orgId}
											alt={family.family_name}
											fill
											className="object-contain"
										/>
									) : null}
								</div>
							</div>
							<div>
								<CardTitle className="text-2xl">
									{family.family_name} family
								</CardTitle>
								<CardDescription>{family.family_id}</CardDescription>
							</div>
						</div>
						<Badge variant="secondary">
							{members.length} models
						</Badge>
					</CardHeader>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Family members</CardTitle>
						<CardDescription>
							Explore related models within this family.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{members.length ? (
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{members.map((member) => {
									const statusKey =
										member.status ?? "default";
									const statusClass =
										STATUS_STYLES[statusKey] ??
										STATUS_STYLES.default;
									const organisationId = member.organisation_id;
									const organisationName =
										member.organisation?.name ??
										organisationId;

									return (
										<Card
											key={member.model_id}
											className="h-full"
										>
											<CardHeader className="space-y-2">
												<div className="flex items-start justify-between gap-2">
													<div>
														<Link
															href={`/models/${member.model_id}`}
															className="font-semibold hover:underline"
														>
															{member.name}
														</Link>
														<p className="text-xs text-muted-foreground">
															{member.model_id}
														</p>
													</div>
													<Badge
														variant="outline"
														className={statusClass}
													>
														{member.status ??
															"Status pending"}
													</Badge>
												</div>
												<div className="flex items-center gap-2 text-sm text-muted-foreground">
													{organisationId ? (
														<>
															<div className="w-5 h-5 rounded border bg-background flex items-center justify-center">
																<div className="relative w-3 h-3">
																	<Logo
																		id={
																			organisationId
																		}
																		alt={
																			organisationName
																		}
																		fill
																		className="object-contain"
																	/>
																</div>
															</div>
															<Link
																href={`/organisations/${organisationId}`}
																className="hover:underline"
															>
																{organisationName}
															</Link>
														</>
													) : (
														<span>Organisation unknown</span>
													)}
												</div>
											</CardHeader>
											<CardContent className="text-xs text-muted-foreground space-y-1">
												{member.release_date ? (
													<p>
														Release date:{" "}
														{member.release_date.split(
															"T"
														)[0]}
													</p>
												) : null}
												{!member.release_date &&
												member.announcement_date ? (
													<p>
														Announced:{" "}
														{member.announcement_date.split(
															"T"
														)[0]}
													</p>
												) : null}
											</CardContent>
										</Card>
									);
								})}
							</div>
						) : (
							<p className="text-sm text-muted-foreground">
								No family members are recorded yet.
							</p>
						)}
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
