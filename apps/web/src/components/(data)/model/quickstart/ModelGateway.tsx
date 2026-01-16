import Hero from "./Hero";
import Quickstart from "./Quickstart";
import Errors from "./Errors";
import Support from "./Support";
import Unavailable from "./Unavailable";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";

interface ModelGatewayProps {
	metadata: ModelGatewayMetadata;
}

export default function ModelGateway({ metadata }: ModelGatewayProps) {
	const isAvailable = metadata.activeProviders.length > 0;
	const endpoint =
		metadata.activeProviders.find((p) => p.endpoint)?.endpoint ??
		metadata.providers.find((p) => p.endpoint)?.endpoint ??
		null;
	const supportedEndpoints = Array.from(
		new Set(metadata.activeProviders.map((p) => p.endpoint).filter(Boolean))
	);
        return (
                <div className="space-y-8">
                        <Hero metadata={metadata} />
                        {isAvailable ? (
				<div className="space-y-8">
                                        <Quickstart
                                                modelId={metadata.modelId}      
                                                aliases={metadata.aliases}      
                                                endpoint={endpoint}
                                                supportedEndpoints={supportedEndpoints}
                                        />
                                        <Errors />
                                        <Support />
                                </div>
			) : (
				<Unavailable modelId={metadata.modelId} />
			)}
		</div>
	);
}
