import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { toast } from "sonner";
import { updateByokFallbackAction } from "@/app/(dashboard)/settings/byok/actions";
import ByokFallbackToggle from "./ByokFallbackToggle";

let change: (enabled: boolean) => Promise<void>;
jest.mock("@/components/ui/switch", () => ({ Switch: (props: { onCheckedChange: typeof change }) => { change = props.onCheckedChange; return null; } }));
jest.mock("sonner", () => ({ toast: { promise: jest.fn() } }));
jest.mock("@/app/(dashboard)/settings/byok/actions", () => ({ updateByokFallbackAction: jest.fn() }));
jest.mock("../PrivateSettingsQuery", () => ({ useSettingsWrite: () => <T,>(operation: Promise<T>) => operation }));

beforeEach(() => jest.clearAllMocks());

it.each([true, false])("reports saved fallback settings with publication=%s", async (published) => {
	const result = { success: true as const, gatewayCacheInvalidated: published };
	jest.mocked(updateByokFallbackAction).mockResolvedValue(result);
	renderToStaticMarkup(<ByokFallbackToggle initialEnabled={true} />);
	await change(false);
	expect(updateByokFallbackAction).toHaveBeenCalledTimes(1);
	expect(updateByokFallbackAction).toHaveBeenCalledWith(false);
	const options = jest.mocked(toast.promise).mock.calls[0][1]!;
	const message = (options.success as (value: typeof result) => string)(result);
	expect(message).toContain("Fallback setting updated");
	expect(message.includes("gateway refresh failed")).toBe(!published);
});

it("waits for the actual mutation rather than the toast identifier", async () => {
	let resolve!: (value: { success: true; gatewayCacheInvalidated: boolean }) => void;
	jest.mocked(updateByokFallbackAction).mockReturnValue(new Promise((done) => { resolve = done; }));
	jest.mocked(toast.promise).mockReturnValue("toast-id" as never);
	renderToStaticMarkup(<ByokFallbackToggle initialEnabled={true} />);
	let settled = false;
	const operation = change(false).then(() => { settled = true; });
	await Promise.resolve();
	expect(settled).toBe(false);
	resolve({ success: true, gatewayCacheInvalidated: false });
	await operation;
	expect(settled).toBe(true);
});
