import { Activity, ArrowUpRight, BookOpen, Boxes, KeyRound, Route } from "lucide-react";

const platformLinks = [
	{ icon: Boxes, title: "Models", description: "Explore models, providers, pricing and capabilities.", url: "https://phaseo.app/models" },
	{ icon: Route, title: "Gateway", description: "Manage routing, fallbacks and provider policies.", url: "https://phaseo.app/settings/gateway" },
	{ icon: Activity, title: "Observability", description: "Review requests, usage, latency and spend.", url: "https://phaseo.app/observability" },
];

export function PlatformHome() {
	const openExternal = (url: string) => {
		if (window.phaseoDesktop) void window.phaseoDesktop.openExternal(url);
		else window.open(url, "_blank", "noopener,noreferrer");
	};
	return <div className="page platform-home">
		<section className="page-heading"><div><h1>Platform</h1><p>Models, routing and usage in the Phaseo web app.</p></div><button className="primary-button" type="button" onClick={() => openExternal("https://phaseo.app/settings/api-keys")}><KeyRound size={16} /> API keys <ArrowUpRight size={14} /></button></section>
		<section className="panel" aria-label="Platform tools">
			{platformLinks.map(({ icon: Icon, title, description, url }) => <button className="platform-link-row" type="button" key={title} onClick={() => openExternal(url)}><span className="attention-icon"><Icon size={18} /></span><span><strong>{title}</strong><small>{description}</small></span><ArrowUpRight size={16} /></button>)}
		</section>
		<button className="secondary-button platform-docs" type="button" onClick={() => openExternal("https://docs.phaseo.app")}><BookOpen size={16} /> Documentation <ArrowUpRight size={14} /></button>
	</div>;
}
