import type { ReactNode } from "react";
import ShowFooterStyle from "@/components/layout/ShowFooterStyle";

export default function ModelDetailLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<ShowFooterStyle />
			{children}
		</>
	);
}
