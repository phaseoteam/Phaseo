import {
	clearProviderInspector,
	dispatchProviderInspectorOpen,
	PROVIDER_INSPECTOR_CHANGE_EVENT,
	subscribeProviderInspectorSelection,
	type ProviderInspectorChangeDetail,
} from "./providerInspectorSync";

describe("provider inspector state", () => {
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

	beforeEach(() => {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: new EventTarget(),
		});
	});

	afterEach(() => {
		clearProviderInspector();
		if (originalWindow) {
			Object.defineProperty(globalThis, "window", originalWindow);
		} else {
			Reflect.deleteProperty(globalThis, "window");
		}
	});

	it("can subscribe without emitting stale state before URL hydration", () => {
		const listener = jest.fn();
		const unsubscribe = subscribeProviderInspectorSelection(listener, false);

		expect(listener).not.toHaveBeenCalled();

		dispatchProviderInspectorOpen("openai");
		expect(listener).toHaveBeenLastCalledWith({
			providerId: "openai",
			serviceTier: null,
		});

		unsubscribe();
	});

	it("broadcasts when the provider closes", () => {
		const listener = jest.fn();
		window.addEventListener(PROVIDER_INSPECTOR_CHANGE_EVENT, listener);
		dispatchProviderInspectorOpen("anthropic");

		clearProviderInspector("anthropic");

		expect(listener).toHaveBeenCalledTimes(2);
		expect(
			(listener.mock.calls[1]?.[0] as CustomEvent<ProviderInspectorChangeDetail>)
				.detail,
		).toEqual({ providerId: null, disableAnimation: true });
	});
});
