import { Outlet } from "@tanstack/react-router";

export default function ModelsLayout() {
	return (
		<div className="flex flex-1 flex-col">
			<div className="flex flex-1 flex-col">
				<Outlet />
			</div>
		</div>
	);
}
