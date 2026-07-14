import OrganisationCard from "./OrganisationCard";
import type { OrganisationCard as OrganisationCardType } from "@/lib/fetchers/organisations/getAllOrganisations";

interface OrganisationDisplayProps {
	organisations: OrganisationCardType[];
}

export default function OrganisationsDisplay({
	organisations,
}: OrganisationDisplayProps) {
	return (
		<>
			<div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
				<h1 className="font-bold text-xl mb-2 md:mb-0">
					Organisations
				</h1>
			</div>
			<div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
				{organisations.map((organisation) => (
					<OrganisationCard
						key={organisation.organisation_id}
						organisation={organisation}
					/>
				))}
			</div>
		</>
	);
}
