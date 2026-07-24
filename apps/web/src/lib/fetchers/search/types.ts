export interface SearchableModel {
	id: string;
	title: string;
	subtitle: string | null;
	href: string;
	logoId: string;
	releaseGroupLabel: string | null;
}

export interface SearchableOrganisation {
	id: string;
	title: string;
	subtitle: string | null;
	href: string;
	logoId: string;
}

export interface SearchableBenchmark {
	id: string;
	title: string;
	subtitle: string | null;
	href: string;
}

export interface SearchableAPIProvider {
	id: string;
	title: string;
	subtitle: string | null;
	href: string;
	logoId: string;
}

export interface SearchableSubscriptionPlan {
	id: string;
	title: string;
	subtitle: string | null;
	href: string;
	logoId: string | null;
}

export interface SearchableCountry {
	id: string;
	title: string;
	subtitle: string | null;
	href: string;
	flagIso: string;
}

export interface SearchData {
	models: SearchableModel[];
	organisations: SearchableOrganisation[];
	benchmarks: SearchableBenchmark[];
	apiProviders: SearchableAPIProvider[];
	subscriptionPlans: SearchableSubscriptionPlan[];
	countries: SearchableCountry[];
	cacheGeneration?: number;
}

type SearchModelTuple = [string, string, string | null, string, string, string | null];
type SearchLogoTuple = [string, string, string | null, string, string];
type SearchBenchmarkTuple = [string, string, string | null, string];
type SearchNullableLogoTuple = [string, string, string | null, string, string | null];
type SearchCountryTuple = [string, string, string | null, string, string];

export interface CompactSearchData {
	m: SearchModelTuple[];
	o: SearchLogoTuple[];
	b: SearchBenchmarkTuple[];
	p: SearchLogoTuple[];
	s: SearchNullableLogoTuple[];
	c: SearchCountryTuple[];
	v?: number;
}
