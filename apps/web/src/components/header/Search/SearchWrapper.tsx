import Search from "./Search";

interface SearchWrapperProps {
    className?: string;
}

export function SearchWrapper({ className }: SearchWrapperProps) {
    return <Search className={className} />;
}
