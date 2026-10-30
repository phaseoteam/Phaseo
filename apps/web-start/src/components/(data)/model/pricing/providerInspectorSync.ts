export const PROVIDER_INSPECTOR_CHANGE_EVENT = "ai-stats-provider-inspector-change";
export type ProviderInspectorChangeDetail = {
	providerId: string | null;
	disableAnimation: boolean;
	navigationProviderIds?: string[];
	serviceTier?: string;
};

export type ProviderInspectorSelection = {
	providerId: string;
	serviceTier: string | null;
};

const PROVIDER_INSPECTOR_STATE_EVENT = "phaseo:provider-inspector-state";

let activeProviderInspectorId: string | null = null;
let activeProviderInspectorSelection: ProviderInspectorSelection | null = null;

export function dispatchProviderInspectorOpen(
	providerId: string,
	disableAnimation = false,
	navigationProviderIds?: string[],
	serviceTier?: string,
): void {
	activeProviderInspectorId = providerId;
	activeProviderInspectorSelection = { providerId, serviceTier: serviceTier ?? null };
	window.dispatchEvent(
		new CustomEvent<ProviderInspectorChangeDetail>(PROVIDER_INSPECTOR_CHANGE_EVENT, {
			detail: { providerId, disableAnimation, navigationProviderIds, serviceTier },
		}),
	);
	window.dispatchEvent(new CustomEvent(PROVIDER_INSPECTOR_STATE_EVENT));
}

export function clearProviderInspector(providerId?: string): void {
	if (providerId && activeProviderInspectorId !== providerId) return;
	activeProviderInspectorId = null;
	activeProviderInspectorSelection = null;
	window.dispatchEvent(
		new CustomEvent<ProviderInspectorChangeDetail>(PROVIDER_INSPECTOR_CHANGE_EVENT, {
			detail: { providerId: null, disableAnimation: true },
		}),
	);
	window.dispatchEvent(new CustomEvent(PROVIDER_INSPECTOR_STATE_EVENT));
}

export function subscribeProviderInspector(
	listener: (providerId: string | null) => void,
): () => void {
	const handleState = () => listener(activeProviderInspectorId);
	handleState();
	window.addEventListener(PROVIDER_INSPECTOR_STATE_EVENT, handleState);
	return () => window.removeEventListener(PROVIDER_INSPECTOR_STATE_EVENT, handleState);
}

export function subscribeProviderInspectorSelection(
	listener: (selection: ProviderInspectorSelection | null) => void,
	emitCurrent = true,
): () => void {
	const handleState = () => listener(activeProviderInspectorSelection);
	if (emitCurrent) handleState();
	window.addEventListener(PROVIDER_INSPECTOR_STATE_EVENT, handleState);
	return () => window.removeEventListener(PROVIDER_INSPECTOR_STATE_EVENT, handleState);
}
