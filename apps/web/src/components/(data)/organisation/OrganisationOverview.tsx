import type { OrganisationOverview as OrganisationOverviewType } from "@/lib/fetchers/organisations/getOrganisation";
import OrganisationLinks from "./OrganisationLinks";
import ModelsDisplay from "./ModelsDisplay";

export interface OrganisationOverviewProps {
	organisation: OrganisationOverviewType;
}

export default function OrganisationOverview({
	organisation,
}: OrganisationOverviewProps) {
	return (
		<div className="w-full mx-auto">
			{/* Header & Description */}
			{organisation.description && (
				<div>
					<h2 className="text-xl font-bold mb-1">
						About {organisation.name}
					</h2>
					<p>{organisation.description}</p>
				</div>
			)}

			{/* Links section */}
			{organisation.organisation_links &&
				organisation.organisation_links.length > 0 && (
					<div className="mt-4">
						<h2 className="text-xl font-semibold mb-2">Links</h2>
						<OrganisationLinks organisation={organisation} />
					</div>
				)}

			{/* Models section */}
			<div className="mt-4">
				<h3 className="text-lg font-semibold mb-1">Latest Models</h3>
				<ModelsDisplay
					models={[...organisation.recent_models]}
					showStatusHeadings={false}
				/>
			</div>
		</div>
	);
}
