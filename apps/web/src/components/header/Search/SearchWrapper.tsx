import { getSearchDataCached } from "@/lib/fetchers/search/getSearchData";
import Search from "./Search";

interface SearchWrapperProps {
    className?: string;
}

export async function SearchWrapper({ className }: SearchWrapperProps) {
    const searchData = await getSearchDataCached();
    return <Search className={className} initialData={searchData} />;
}
