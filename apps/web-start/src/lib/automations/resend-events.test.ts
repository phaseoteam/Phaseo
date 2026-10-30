const sendEvent = jest.fn();

jest.mock("resend", () => ({
	Resend: jest.fn(() => ({
		events: { send: sendEvent },
	})),
}));

import {
	isResendOnboardingAutomationsEnabled,
	sendUserCreatedEvent,
} from "./resend-events";

const originalApiKey = process.env.RESEND_API_KEY;
const originalEnabled = process.env.RESEND_ONBOARDING_AUTOMATIONS_ENABLED;

describe("Resend onboarding events", () => {
	beforeEach(() => {
		sendEvent.mockReset();
		sendEvent.mockResolvedValue({ data: { id: "event_1" }, error: null });
		delete process.env.RESEND_API_KEY;
		delete process.env.RESEND_ONBOARDING_AUTOMATIONS_ENABLED;
	});

	afterAll(() => {
		if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
		else process.env.RESEND_API_KEY = originalApiKey;
		if (originalEnabled === undefined) delete process.env.RESEND_ONBOARDING_AUTOMATIONS_ENABLED;
		else process.env.RESEND_ONBOARDING_AUTOMATIONS_ENABLED = originalEnabled;
	});

	it("does nothing when Resend is not configured", async () => {
		expect(isResendOnboardingAutomationsEnabled()).toBe(false);

		await sendUserCreatedEvent({
			email: "new@example.com",
			payload: {
				userId: "user_1",
				workspaceId: "workspace_1",
				displayName: "New User",
				firstName: "New",
				source: "auth_callback",
				createdAtIso: "2026-08-30T22:00:00.000Z",
			},
		});

		expect(sendEvent).not.toHaveBeenCalled();
	});

	it("emits only the supplied new-user event when enabled", async () => {
		process.env.RESEND_API_KEY = "re_test";
		process.env.RESEND_ONBOARDING_AUTOMATIONS_ENABLED = "true";

		await sendUserCreatedEvent({
			email: "new@example.com",
			payload: {
				userId: "user_1",
				workspaceId: "workspace_1",
				displayName: "New User",
				firstName: "New",
				source: "auth_callback",
				createdAtIso: "2026-08-30T22:00:00.000Z",
			},
		});

		expect(sendEvent).toHaveBeenCalledTimes(1);
		expect(sendEvent).toHaveBeenCalledWith({
			event: "user.created",
			email: "new@example.com",
			payload: expect.objectContaining({ userId: "user_1", workspaceId: "workspace_1" }),
		});
	});

	it("honours the explicit automation kill switch", async () => {
		process.env.RESEND_API_KEY = "re_test";
		process.env.RESEND_ONBOARDING_AUTOMATIONS_ENABLED = "false";

		await sendUserCreatedEvent({
			email: "new@example.com",
			payload: {
				userId: "user_1",
				workspaceId: "workspace_1",
				displayName: "New User",
				firstName: "New",
				source: "auth_callback",
				createdAtIso: "2026-08-30T22:00:00.000Z",
			},
		});

		expect(sendEvent).not.toHaveBeenCalled();
	});
});
