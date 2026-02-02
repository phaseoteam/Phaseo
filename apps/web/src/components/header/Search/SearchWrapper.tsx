import { getSearchDataCached } from "@/lib/fetchers/search/getSearchData";
import Search from "./Search";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";

interface SearchWrapperProps {
    className?: string;
}

export async function SearchWrapper({ className }: SearchWrapperProps) {
    const includeHidden = await resolveIncludeHidden();
    const searchData = await getSearchDataCached(includeHidden);
    return <Search className={className} initialData={searchData} />;
}
