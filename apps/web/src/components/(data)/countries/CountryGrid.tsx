import { useTranslations } from "next-intl";
import CountryCard from "./CountryCard";
import type { CountryListSummary } from "@/lib/fetchers/countries/types";

interface CountriesGridProps {
	countries: CountryListSummary[];
}

export default function CountriesGrid({ countries }: CountriesGridProps) {
	if (!countries.length) {
		const t = useTranslations("Catalogue.countries");
		return (
			<p className="text-sm text-muted-foreground">
				{t("noCountryData")}
			</p>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{countries.map((country) => (
				<CountryCard key={country.iso} country={country} />
			))}
		</div>
	);
}
