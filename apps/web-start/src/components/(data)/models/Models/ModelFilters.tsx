import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface ModelFiltersProps {
	search: string;
	setSearch: (v: string) => void;
}

export function ModelFilters({ search, setSearch }: ModelFiltersProps) {
	return (
		<div className="flex flex-col md:flex-row md:items-end gap-2 p-4 flex-wrap">
			{/* Search Bar */}
			<div className="flex-1 flex justify-end">
				<div className="relative w-full max-w-xs">
					
				</div>
			</div>
		</div>
	);
}
