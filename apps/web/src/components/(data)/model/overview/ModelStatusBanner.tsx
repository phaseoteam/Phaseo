import { AlertTriangle, Info, XCircle } from "lucide-react";

interface ModelStatusBannerProps {
	status:
		| "Rumoured"
		| "Announced"
		| "Available"
		| "Deprecated"
		| "Retired"
		| null;
}

const RUMOURED_DISCORD_LINK = "https://discord.gg/zDw73wamdX";

export default function ModelStatusBanner({ status }: ModelStatusBannerProps) {
	if (status === "Rumoured") {
		return (
			<div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
				<div className="flex">
					<div className="py-1">
						<AlertTriangle className="h-6 w-6 text-yellow-500 mr-4" />
					</div>
					<div>
						<p className="font-bold">Rumoured Model</p>
						<p className="text-sm">
							This model is rumoured to be coming soon. Any data
							here is subject to change until the release is
							confirmed. Join our{" "}
							<a
								href={RUMOURED_DISCORD_LINK}
								target="_blank"
								rel="noreferrer"
								className="text-blue-600 underline"
							>
								Discord
							</a>{" "}
							to be notified of new models and updates.
						</p>
					</div>
				</div>
			</div>
		);
	}

	if (status === "Announced") {
		return (
			<div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
				<div className="flex">
					<div className="py-1">
						<Info className="h-6 w-6 text-blue-500 mr-4" />
					</div>
					<div>
						<p className="font-bold">Announced Model</p>
						<p className="text-sm">
							This model has been announced, but not released. We
							await the full release to make more information
							available.
						</p>
					</div>
				</div>
			</div>
		);
	}

	if (status === "Deprecated") {
		return (
			<div className="bg-orange-100 border border-orange-400 text-orange-700 px-4 py-3 rounded mb-4">
				<div className="flex">
					<div className="py-1">
						<AlertTriangle className="h-6 w-6 text-orange-500 mr-4" />
					</div>
					<div>
						<p className="font-bold">Deprecated Model</p>
						<p className="text-sm">
							This model has been marked deprecated. It is likely
							to be retired soon. You should look to move off this
							model and onto a newer model if you are using it.
						</p>
					</div>
				</div>
			</div>
		);
	}

	if (status === "Retired") {
		return (
			<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
				<div className="flex">
					<div className="py-1">
						<XCircle className="h-6 w-6 text-red-500 mr-4" />
					</div>
					<div>
						<p className="font-bold">Retired Model</p>
						<p className="text-sm">
							This model has reached end of life, and can no
							longer be used. This page will likely receive no
							updates from now on.
						</p>
					</div>
				</div>
			</div>
		);
	}

	return null;
}
