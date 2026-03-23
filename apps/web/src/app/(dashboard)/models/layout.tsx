import type { ReactNode } from "react";
import NoFooterStyle from "@/components/layout/NoFooterStyle";

export default function ModelsLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<NoFooterStyle />
			<div className="flex flex-1 flex-col">
				<div className="flex flex-1 flex-col">
					{children}
				</div>
			</div>
		</>
	);
}
