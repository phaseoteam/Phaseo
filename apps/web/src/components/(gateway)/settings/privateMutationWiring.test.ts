import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// The shared write hook has deferred-success/failure tests. These checks ensure
// each feature actually uses it (server revalidatePath alone is insufficient).
it.each([
	["byok/BYOKInputDialog.tsx", ["createByokKeyAction", "updateByokKeyAction"]],
	["byok/DeleteKeyButton.tsx", ["deleteByokKeyAction"]],
	["byok/ByokFallbackToggle.tsx", ["updateByokFallbackAction"]],
	["byok/ByokProviderKeys.tsx", ["updateByokKeyAction", "reorderByokKeyAction"]],
	["webhooks/WebhookEndpointForm.tsx", ["createWebhookEndpointAction", "updateWebhookEndpointAction", "sendWebhookEndpointTestAction"]],
	["webhooks/WebhooksSettingsClient.tsx", ["action"]],
	["observability/BroadcastDestinationCreateClient.tsx", ["createBroadcastDestinationAction"]],
	["keys/KeysPanel.tsx", ["updateApiKeyAction", "deleteApiKeyAction"]],
	["../credits/RecentTransactions.tsx", ["requestCreditRefund"]],
	["oauth-apps/CreateOAuthAppDialog.tsx", ["createOAuthAppAction"]],
	["oauth-apps/DeleteOAuthAppDialog.tsx", ["deleteOAuthAppAction"]],
	["oauth-apps/RegenerateSecretDialog.tsx", ["regenerateClientSecretAction"]],
	["oauth-apps/OAuthAppDetailPanel.tsx", ["updateOAuthAppScopesAction"]],
	["oauth-apps/RedirectUriManager.tsx", ["updateRedirectUrisAction"]],
	["beta/BetaSettingsClient.tsx", ["updateBetaPreferences"]],
] as const)("invalidates every settings write in %s after settlement", (file, actions) => {
	const source = fs.readFileSync(path.join(__dirname, file), "utf8");
	const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const seen = new Set<string>();
	function visit(node: ts.Node) {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && (actions as readonly string[]).includes(node.expression.text)) {
			seen.add(node.expression.text);
			let parent: ts.Node | undefined = node.parent;
			while (parent && !(ts.isCallExpression(parent) && parent.expression.getText(ast) === "write")) parent = parent.parent;
			expect(parent).toBeDefined();
		}
		ts.forEachChild(node, visit);
	}
	visit(ast);
	expect([...seen].sort()).toEqual([...actions].sort());
	expect(source).toMatch(/const write = useSettingsWrite\(\)/);
});
