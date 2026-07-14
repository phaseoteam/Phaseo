import CountryCard from "./CountryCard";
import type { CountrySummary } from "@/lib/fetchers/countries/getCountrySummaries";

interface CountriesGridProps {
	countries: CountrySummary[];
}

export default function CountriesGrid({ countries }: CountriesGridProps) {
	if (!countries.length) {
		return (
			<p className="text-sm text-muted-foreground">
				Country data is not available yet.
			</p>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{countries.map((country) => (
				<CountryCard key={country.iso} country={country} />
			))}
		</div>
	);
}
