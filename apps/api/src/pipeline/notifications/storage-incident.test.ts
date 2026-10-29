import { describe, expect, it } from "vitest";
import { renderStorageIncidentEmail } from "./storage-incident";

describe("storage incident email", () => {
	it("names the platform, the workspace and how many keys were revoked", () => {
		const email = renderStorageIncidentEmail({
			location_id: "railway", action: "revoke", keys: 3, workspace_name: "Acme <Prod>",
			message: "Railway reported exposed environment variables.", source_url: "https://blog.railway.com/p/security",
		});
		expect(email.subject).toBe("Security alert: 3 API keys revoked after a Railway breach");
		expect(email.text).toContain("Phaseo has revoked 3 API keys in Acme <Prod> that you recorded as stored in Railway.");
		expect(email.text).toContain("Railway's disclosure: https://blog.railway.com/p/security");
		expect(email.text).toContain("https://phaseo.app/settings/security");
		expect(email.html).toContain("Acme &lt;Prod&gt;");
		expect(email.html).not.toContain("<Prod>");
	});

	it("describes a pause and ignores a non-https source link", () => {
		const email = renderStorageIncidentEmail({ location_id: "vercel", action: "pause", keys: 1, source_url: "javascript:alert(1)" });
		expect(email.subject).toBe("Security alert: 1 API key paused after a Vercel breach");
		expect(email.text).toContain("Rotate these keys before resuming them");
		expect(email.html).not.toContain("javascript:");
	});
});
