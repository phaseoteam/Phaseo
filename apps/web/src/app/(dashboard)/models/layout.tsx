import type { ReactNode } from "react";
import HideGlobalFooter from "@/components/layout/HideGlobalFooter";

export default function ModelsLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<HideGlobalFooter />
			<div className="flex flex-1 flex-col">
				<div className="flex flex-1 flex-col">
					{children}
				</div>
			</div>
		</>
	);
}
