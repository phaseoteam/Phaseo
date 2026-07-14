import { describe, expect, it } from "vitest";
import {
	resolveActiveKeyPepper,
	resolveKeyPepperCandidates,
} from "./keyPepper";

describe("key pepper configuration", () => {
	it("requires KEY_PEPPER_ACTIVE and does not accept the removed legacy name", () => {
		expect(resolveActiveKeyPepper({ KEY_PEPPER_ACTIVE: "active", KEY_PEPPER_PREVIOUS: undefined })).toBe("active");
		expect(resolveActiveKeyPepper({ KEY_PEPPER_ACTIVE: "", KEY_PEPPER_PREVIOUS: undefined })).toBeNull();
		expect(resolveActiveKeyPepper({ KEY_PEPPER: "legacy" } as never)).toBeNull();
	});

	it("validates with active first and previous only when distinct", () => {
		expect(resolveKeyPepperCandidates({
			KEY_PEPPER_ACTIVE: "active",
			KEY_PEPPER_PREVIOUS: "previous",
		})).toEqual([
			{ source: "active", value: "active" },
			{ source: "previous", value: "previous" },
		]);
		expect(resolveKeyPepperCandidates({
			KEY_PEPPER_ACTIVE: "active",
			KEY_PEPPER_PREVIOUS: "active",
		})).toEqual([{ source: "active", value: "active" }]);
	});
});
