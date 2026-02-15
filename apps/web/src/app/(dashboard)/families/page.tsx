import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	getAllFamiliesCached,
	type FamilyCard,
} from "@/lib/fetchers/families/getAllFamilies";

export const metadata: Metadata = {
	title: "AI Model Families - Track Related AI Model Releases",
	description:
		"Explore AI model families to see related model releases, providers, and timelines in one place.",
	keywords: [
		"AI model families",
		"model families",
		"AI model variants",
		"AI providers",
		"AI Stats",
	],
	alternates: {
		canonical: "/families",
	},
};

export default async function FamiliesPage() {
	const families = (await getAllFamiliesCached()) as FamilyCard[];

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8 space-y-6">
				<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
					<div>
						<h1 className="text-2xl font-semibold">Model families</h1>
						<p className="text-sm text-muted-foreground">
							Browse model families and explore related releases.
						</p>
					</div>
					<span className="text-sm text-muted-foreground">
						{families.length} families tracked
					</span>
				</div>

				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{families.map((family) => (
						<Link
							key={family.family_id}
							href={`/families/${family.family_id}`}
							className="group"
						>
							<Card className="h-full transition group-hover:border-primary/60 group-hover:shadow-md">
								<CardHeader className="flex flex-row items-center gap-3">
									<div className="w-10 h-10 rounded-xl border bg-background flex items-center justify-center">
										<div className="relative w-6 h-6">
											{family.organisation_id ? (
												<Logo
													id={family.organisation_id}
													alt={family.family_name}
													fill
													className="object-contain"
												/>
											) : null}
										</div>
									</div>
									<div className="min-w-0">
										<CardTitle className="text-base truncate">
											{family.family_name}
										</CardTitle>
										<p className="text-xs text-muted-foreground truncate">
											{family.family_id}
										</p>
									</div>
								</CardHeader>
								<CardContent className="text-xs text-muted-foreground">
									{family.organisation_id
										? `Organisation: ${family.organisation_id}`
										: "Organisation not specified"}
								</CardContent>
							</Card>
						</Link>
					))}
				</div>
			</div>
		</main>
	);
}
