import Search from "./Search";
import { getSearchDataCached } from "@/lib/fetchers/search/getSearchData";

interface SearchWrapperProps {
	className?: string;
}

export async function SearchWrapper({ className }: SearchWrapperProps) {
	const initialData = await getSearchDataCached(false);
	return <Search className={className} initialData={initialData} />;
}
