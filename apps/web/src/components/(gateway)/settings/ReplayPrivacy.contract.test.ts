import fs from "node:fs";
import path from "node:path";

const webRoot = process.cwd();

// Session replay masks inputs by default but records visible text, image
// sources and attributes. Every place that shows a plaintext secret must sit
// inside an element with PostHog's `ph-no-capture` class.
const SECRET_RENDERS: Array<[file: string, expression: string]> = [
	["src/components/(gateway)/settings/keys/CreateKeyDialog.tsx", "{plainKey}"],
	["src/components/(gateway)/settings/keys/RotateKeyItem.tsx", "{newPlaintext}"],
	["src/components/(gateway)/settings/keys/OnePasswordSaveButton.tsx", "value: encodedValue"],
	["src/components/(gateway)/settings/management-api-keys/CreateManagementKeyDialog.tsx", "{plainKey}"],
	["src/components/(gateway)/onboarding/InteractiveOnboarding.tsx", "{createdPlaintextKey}"],
	["src/components/(gateway)/settings/oauth-apps/CreateOAuthAppDialog.tsx", "{createdApp.client_secret}"],
	["src/components/(gateway)/settings/oauth-apps/RegenerateSecretDialog.tsx", "{newSecret}"],
	["src/components/(gateway)/settings/webhooks/WebhookSecretNotice.tsx", "{secret}"],
	["src/components/(gateway)/settings/account/ProviderWebhookSettings.tsx", "{secret}</code>"],
	["src/components/(gateway)/settings/account/ProviderOnboardingClient.tsx", "{submitted.webhookSecret}"],
	["src/components/(gateway)/settings/account/ProviderOnboardingClient.tsx", "{claim.token}"],
	["src/components/(gateway)/settings/account/MFAEnrollmentFlow.tsx", "src={qrCode.trim()}"],
	["src/components/(gateway)/settings/account/MFAEnrollmentFlow.tsx", "{secret}"],
];

function nearestClassNameBefore(source: string, index: number): string | null {
	const head = source.slice(0, index);
	const start = Math.max(head.lastIndexOf('className="'), head.lastIndexOf("className={"));
	return start < 0 ? null : head.slice(start);
}

describe("session replay privacy", () => {
	it.each(SECRET_RENDERS)("%s hides %s from replay", (file, expression) => {
		const source = fs.readFileSync(path.join(webRoot, file), "utf8");
		const index = source.indexOf(expression);
		expect(index).toBeGreaterThan(-1);
		expect(nearestClassNameBefore(source, index)).toContain("ph-no-capture");
	});
});
