// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { confirmWorkspaceSwitch, useWorkspaceSwitchGuard } from "./switchGuard";

it("waits for the draft owner's decision before allowing a workspace switch", async () => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	const container = document.createElement("div");
	const root = createRoot(container);
	let guard: ReturnType<typeof useWorkspaceSwitchGuard>;
	function Draft({ dirty }: { dirty: boolean }) {
		guard = useWorkspaceSwitchGuard(dirty);
		return null;
	}
	try {
		await act(() => root.render(<Draft dirty />));
		let request!: Promise<boolean>;
		await act(() => { request = confirmWorkspaceSwitch(); });
		expect(guard!.active).toBe(true);
		await act(() => guard!.reject());
		await expect(request).resolves.toBe(false);
		await act(() => { request = confirmWorkspaceSwitch(); });
		await act(() => guard!.accept());
		await expect(request).resolves.toBe(true);
		await act(() => root.render(<Draft dirty={false} />));
		await expect(confirmWorkspaceSwitch()).resolves.toBe(true);
		await act(() => root.render(<Draft dirty />));
		await act(() => { request = confirmWorkspaceSwitch(); });
		await act(() => root.unmount());
		await expect(request).resolves.toBe(false);
	} finally {
		await act(() => root.unmount());
	}
});
