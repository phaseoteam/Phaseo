import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import NotificationDestinationsClient from "./NotificationDestinationsClient";
import type { NotificationDestination } from "@/lib/fetchers/internal/settingsTypes";

vi.mock("@/i18n/react", () => ({ useTranslations: () => Object.assign((key: string) => key, { has: () => false, rich: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), promise: vi.fn() } }));
vi.mock("../PrivateSettingsQuery", () => ({ useSettingsWrite: () => (promise: Promise<unknown>) => promise }));
vi.mock("@/features/settings/credits/actions", () => ({
	createNotificationDestination: vi.fn(),
	deleteNotificationDestination: vi.fn(),
	rotateNotificationDestinationSecret: vi.fn(),
	setBillingNotificationPreference: vi.fn(),
	testNotificationConfiguration: vi.fn(),
	testNotificationDestination: vi.fn(),
}));
vi.mock("@/components/(gateway)/settings/notifications/NotificationRouteSelector", () => ({ default: () => null }));

const destination = (overrides: Partial<NotificationDestination>): NotificationDestination => ({ id: "d1", name: "Ops hook", type: "custom_webhook", targetPreview: "hooks.example.com/••••hook", status: "active", createdAt: null, ...overrides });
const render = (destinations: NotificationDestination[]) => renderToStaticMarkup(<NotificationDestinationsClient initialDestinations={destinations} initialModelDeprecationEnabled={false} initialModelDeprecationIncludeAdmins={false} initialNotificationRoutes={{}} />);

describe("notification destination signing state", () => {
	it("marks a legacy custom webhook as unsigned and offers to generate a secret", () => {
		const html = render([destination({ hasSigningSecret: false })]);
		expect(html).toContain("notificationCopy.unsigned");
		expect(html).toContain("notificationCopy.unsignedHelp");
		expect(html).toContain("notificationCopy.generateSecret");
		expect(html).not.toContain("notificationCopy.rotateSecret");
	});

	it("offers rotation for a signed custom webhook", () => {
		const html = render([destination({ hasSigningSecret: true })]);
		expect(html).toContain("notificationCopy.signed");
		expect(html).toContain("notificationCopy.rotateSecret");
		expect(html).not.toContain("notificationCopy.unsignedHelp");
	});

	it("shows no signing controls for chat destinations", () => {
		const html = render([destination({ type: "slack", targetPreview: "hooks.slack.com/••••abcd" })]);
		expect(html).not.toContain("notificationCopy.generateSecret");
		expect(html).not.toContain("notificationCopy.rotateSecret");
		expect(html).not.toContain("notificationCopy.unsigned");
	});
});
