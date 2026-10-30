const PROVIDER_VIEW_EVENT = "phaseo:model-provider-view";

type ProviderViewState = { modelId: string; providerView: string | null };

let currentProviderView: ProviderViewState | null = null;

export function publishProviderView(modelId: string, providerView: string | null): void {
	currentProviderView = { modelId, providerView };
	window.dispatchEvent(new CustomEvent<ProviderViewState>(PROVIDER_VIEW_EVENT, {
		detail: currentProviderView,
	}));
}

export function subscribeProviderView(
	modelId: string,
	listener: (providerView: string | null) => void,
): () => void {
	listener(currentProviderView?.modelId === modelId ? currentProviderView.providerView : null);
	const handleProviderView = (event: Event) => {
		const detail = (event as CustomEvent<ProviderViewState>).detail;
		if (detail.modelId === modelId) listener(detail.providerView);
	};
	window.addEventListener(PROVIDER_VIEW_EVENT, handleProviderView);
	return () => window.removeEventListener(PROVIDER_VIEW_EVENT, handleProviderView);
}
