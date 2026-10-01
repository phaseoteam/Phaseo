import type { ReactNode } from "react";

export default function ModelsLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<div className="flex flex-1 flex-col">
				<div className="flex flex-1 flex-col">
					{children}
				</div>
			</div>
		</>
	);
}
