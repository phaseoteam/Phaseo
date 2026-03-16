import type { ReactNode } from "react";
import ShowGlobalFooter from "@/components/layout/ShowGlobalFooter";

export default function ModelDetailLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<ShowGlobalFooter />
			{children}
		</>
	);
}
