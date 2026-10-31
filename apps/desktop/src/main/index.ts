import "./threadPool";
import { imageMime } from "./attachments";
import { linkTitle } from "./linkTitle";
import { KeybindingsFile } from "./keybindingsFile";
import { browserShortcuts } from "../shared/keybindings";
import { phaseoProfile, renewPhaseoKey, PHASEO_GATEWAY_ENDPOINT } from "./phaseoOAuth";
import { browserSignIn, issuePhaseoKey, parsePhaseoSession, passwordSignIn, phaseoAccountProfile, PHASEO_PROVIDERS, refreshPhaseoSession, revokePhaseoKey, secondFactor, signOutPhaseo, verifySecondFactor, type PhaseoProvider, type PhaseoSession } from "./phaseoLogin";
import { PhaseoSkills } from "./phaseoSkills";
import { GlobalInstructions } from "./globalInstructions";
import { codexNativeActions } from "./codexNativeActions";
import { claudeNativeActions, claudeNativeModels } from "./claudeNativeActions";
import { piNativeActions } from "./piNativeActions";
import { copyFile, mkdir } from "node:fs/promises";
import { openCodeNativeActions } from "./openCodeNativeActions";
import { OpenCode } from "@opencode/client";
import { Service } from "@opencode/client/service";
import { PromptCommands } from "./promptCommands";
import { McpPromptCatalogService } from "./mcpPromptCatalog";
import { importMcpPromptAttachments } from "./mcpPromptAttachments";
import { projectPullRequestContents } from "./projectPullRequestContents";
import { projectPullRequestFiles, projectPullRequestFilesViewed, projectSetPullRequestFilesViewed } from "./projectPullRequestFiles";
import { projectPullRequestThreads } from "./projectPullRequestThreads";
import { app, autoUpdater, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, safeStorage, shell } from "electron";
import path from "node:path";
import { BrowserHost } from "./browserHost";
import { BrowserAgent } from "./browserAgent";
import { BrowserRecordings } from "./browserRecordings";
import { localServers, probeAddress } from "./browserLocalServers";
import { readT3ProjectFile } from "./t3ProjectFile";
import { browserId, probeUrl } from "../shared/browser";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { DesktopAppAction, DesktopUpdateState, DesktopWindowAction } from "../shared/desktop";
import { isAllowedExternalUrl } from "../shared/desktop";
import { validateCommand } from "../shared/workspace";
import { validateWorktreeChatRequest } from "../shared/worktreeChat";
import { validatePublishRepository } from "../shared/gitWorkflow";
import { validateWorktreeCleanupRequest } from "../shared/worktreeCleanup";
import { limitResetAt } from "../shared/usageLimitRecovery";
import { validateSecretAnswer } from "../shared/secretRequests";
import { generateCommitMessage, gitInit, publishOwners, publishRepository } from "./gitWorkflow";
import type { Account, AccountStatus, Harness, PhaseoSignInMethod, PhaseoSignInResult } from "../shared/workspace";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { resolveNativeCommand } from "./nativeProcess";
import { harnessVersion } from "./harnessVersion";
import { claudeModelsFor } from "./claudeModels";
import { resolveHarnessMaintenance } from "./harnessMaintenance";
import { runHarnessUpdate } from "./runHarnessUpdate";
import { resolveGrokCommand } from "./grokLaunch";
import { grokAccountStatus } from "./grokAccountStatus";
import { grokModelCatalog } from "./grokModelCatalog";
import { SecretVault } from "./secretVault";
import { windowsCredentialEncryption } from "./windowsCredentialEncryption";
import { signInNative } from "./accountConnections";
import { gitReview, listProjectFiles, projectRelativePath, readFilePreview, readProjectFile } from "./projectFiles";
import { gitRefs, gitScopedDiff, readScopedDiffContents } from "./gitDiffScopes";
import { turnChanges } from "./gitCheckpoints";
import { isTreeId } from "../shared/gitDiff";
import { extractPdfText } from "./pdfText";
import { projectTree, refreshProjectIndex, searchProjectFiles } from "./projectFileSearch";
import { searchProjectContents } from "./projectContentSearch";
import { cloneRepository, cloneSource } from "./projectClone";
import { homedir, release } from "node:os";
import { buildStamp } from "./buildInfo";
import { prepareTriageCheckout, writeTriagePlaybook } from "./triage";
import { diagnosticsSection, triagePlaybook, triagePlaybookName, triageSourceRepository, type TriageBuild, type TriagePreparation } from "../shared/triage";
import { readTraceDiagnostics } from "./diagnostics/traceDiagnostics";
import { UsageHubs, usageHubFile } from "./usageHubs";
import { validateUsageHubRequest } from "../shared/usageHubs";
import { editorInstallations, findEditor, launchEditor, openProjectTarget } from "./projectEditors";
import { codexModels } from "./modelCatalog";
import { apiModelCatalog, type CatalogPageValidator } from "./apiModelCatalog";
import { CATALOG_VERSION, ModelCatalogCache } from "./modelCatalogCache";
import { HarnessModelCache } from "./harnessModelCache";
import { openCodeModels, piModels } from "./nativeModels";
import { resolveOpenCodeCommand } from "./openCodeService";
import { TerminalService } from "./terminalService";
import { backgroundCommands, closeBackgroundCommands } from "./backgroundCommands";
import { closePhaseoMcpPool } from "./phaseoMcp";
import { contentHash, writeProjectFile } from "./projectEdits";
import { gitBranches, gitCommand, gitPush, withGitLock } from "./gitOperations";
import { projectPullRequests, projectPullRequest } from "./projectPullRequests";
import { listPullRequestDirectory, pullRequestCounts } from "./pullRequestDirectory";
import { TranscriptScanner, transcriptFiles, transcriptFolders, type TranscriptFolder } from "./usageTranscripts";
import { TranscriptWriter } from "./usageLedgerWrites";
import { localDay, modelMatchKey, type TokenPrices, type UsagePeriod } from "../shared/usageLedger";
import { ghFailure, projectPullRequestAction, projectPullRequestBehind, projectPullRequestCandidates, projectPullRequestView, readPullRequestView, runGh } from "./projectPullRequestView";
import { PullRequestGuides } from "./pullRequestGuides";
import { PullRequestWatcher } from "./pullRequestWatcher";
import { FactoryService, factoryDataFolder } from "./factory/service";
import { factoryBroadcaster, registerFactoryIpc } from "./factory/ipc";
import { legacyFactoryFolder } from "./factory/persistence";
import { IssueWatcher } from "./issueWatcher";
import { searchGithubReferences } from "./projectIssues";
import { issueLinkSnapshot, validateGithubReferenceQuery } from "../shared/issueView";
import { checkoutPullRequestHere, checkoutPullRequestWorktree } from "./pullRequestCheckout";
import { readPullRequestStack, runPullRequestStackAction } from "./pullRequestStacks";
import { git } from "./gitProcess";
import { branchPullRequest, forgetBranchPullRequest } from "./branchPullRequest";
import { createPullRequest } from "./createPullRequest";
import { githubRepository } from "./projectPullRequests";
import { pullRequestLinkSnapshot } from "../shared/pullRequestView";
import { readGitHunks } from "./gitHunks";
import { readGitDiffContents } from "./gitDiffContents";
import { piEntries } from "./piLaunch";
import { exportFilename, saveTaskExport, taskExport } from "./taskExport";
import { readConversation } from "./taskImport";
import { nativeAccountStatus } from "./accountStatus";
import { checkAcpAgent } from "./acpAgentStatus";
import { validateMcpCommand } from "../shared/mcp";
import { validatePreferences } from "../shared/preferences";
import { validateProjectUpdate } from "../shared/projectSettings";
import { TaskNotifications } from "./taskNotifications";
import { MissionService } from "./missionService";
import { validateMissionCommand } from "../shared/missions";
import { cursorAccountStatus, cursorModels, cursorSignIn } from "./cursorAccounts";
import { registerDiagnosticsIpc, stopTracing, traceIpcHandlers } from "./diagnostics/diagnosticsIpc";
import type { ProcessOwner } from "./diagnostics/processTable";
import { span } from "./diagnostics/tracer";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.join(currentDirectory, "../preload/index.cjs");
const rendererPath = path.join(currentDirectory, "../renderer/index.html");
const developmentUrl = app.isPackaged ? undefined : process.env.PHASEO_DESKTOP_DEV_URL;
const applicationIcon = path.join(app.getAppPath(), "assets", `icon-${developmentUrl ? "development" : "production"}.png`);
const updateFeedUrl = process.env.PHASEO_DESKTOP_UPDATE_URL;
let workspaceRuntime: WorkspaceRuntime;
let pullRequestGuides: PullRequestGuides;
/** Code ▸ Factory; PHASEO_FACTORY_DEMO=1 runs it on demo data, for screenshots. */
let factoryService: FactoryService | undefined;
let globalInstructions: GlobalInstructions;
let shutdownComplete = false;
let shutdownStarted = false;
const signIns = new Map<string, AbortController>();
const phaseoSignIns = new Map<number, AbortController>();
const modelChecks = new Map<Harness, number>();
const nativeCatalogChecks = new Set<AbortController>();
const mcpPromptChecks = new Map<string, { controller: AbortController; taskId: string; senderId: number }>();
let harnessUpdate: { harness: "codex" | "claude" | "pi"; controller: AbortController; completed: Promise<void> } | undefined;
const accountChecks = new Map<string, AbortController>();
/** A status check already running answers anyone who asks again (the sidebar and Usage & limits both read limits). */
const accountStatusRuns = new Map<string, Promise<AccountStatus>>();
const agentChecks = new Map<string, AbortController>();
let credentialVault: SecretVault;
let terminalService: TerminalService;
let taskNotifications: TaskNotifications;
let missionService: MissionService;
let settleTimer: ReturnType<typeof setInterval> | undefined;
let worktreeCleanupTimer: ReturnType<typeof setInterval> | undefined;
/** T3's automatic worktree cleanup, when turned on in Settings → General. */
const autoCleanWorktrees = () => { if (!shutdownStarted && workspaceRuntime.store.getPreferences().worktreeCleanup.enabled) void workspaceRuntime.cleanWorktrees("auto").catch(() => {}); };
let phaseoSignInTimer: ReturnType<typeof setInterval> | undefined;
let pullRequestWatcher: PullRequestWatcher | undefined;
let issueWatcher: IssueWatcher | undefined;
let modelCatalogCache: ModelCatalogCache;
let harnessModelCache: HarnessModelCache;
/** Ends model discovery still running at quit, such as a background refresh of a harness's list. */
const modelDiscovery = new AbortController();
// Before any handler is registered, so each one is traced (slow or failed calls only).
traceIpcHandlers(ipcMain);
const diagnostics = registerDiagnosticsIpc(ipcMain, { senderWindow, owners: terminalOwners });
/** Terminal shells by PID, named as the terminal list names them, with their chat. */
function terminalOwners() {
	const owners = new Map<number, ProcessOwner>();
	if (!terminalService || !workspaceRuntime) return owners;
	const tasks = new Map(workspaceRuntime.store.getOverview().tasks.map(task => [task.id, task.title]));
	for (const owner of terminalService.processOwners()) { const chat = owner.taskId ? tasks.get(owner.taskId) : undefined; owners.set(owner.pid, { label: chat ? `${owner.title} · ${chat}` : owner.title, kind: "terminal" }); }
	return owners;
}
ipcMain.handle("workspace:missions", event => { if (!senderWindow(event)) throw new Error("Invalid scheduled task request."); return workspaceRuntime.store.missions.list(); });
ipcMain.handle("workspace:mission", (event, value: unknown) => { if (!senderWindow(event)) throw new Error("Invalid scheduled task request."); return missionService.command(validateMissionCommand(value)); });
ipcMain.handle("workspace:usage-report", async (event, period: unknown) => {
	if (!senderWindow(event) || !["today", "7d", "30d", "90d"].includes(period as string)) throw new Error("Invalid usage request.");
	// New Claude Code and Codex history is read in the background; the page hears when it lands.
	void transcriptScanner?.scan();
	const report = workspaceRuntime.store.usageReport(period as UsagePeriod, await usagePrices());
	const pullRequests = await usagePullRequests(localDay(new Date(report.from)));
	return pullRequests ? { ...report, activity: { ...report.activity, pullRequests } } : report;
});
ipcMain.handle("workspace:autopilot-log", event => { if (!senderWindow(event)) throw new Error("Invalid Autopilot log request."); return workspaceRuntime.store.autopilotLog(); });
ipcMain.handle("workspace:global-instructions", event => { if (!senderWindow(event)) throw new Error("Untrusted instruction request."); return globalInstructions.read(); });
ipcMain.handle("workspace:save-global-instructions", (event, edit: unknown) => { if (!senderWindow(event) || shutdownStarted) throw new Error("Instruction editing is unavailable."); return globalInstructions.save(edit); });
ipcMain.handle("workspace:preferences", event => { if (!senderWindow(event)) throw new Error("Invalid preferences request."); return { preferences: workspaceRuntime.store.getPreferences(), notificationsSupported: Notification.isSupported() }; });
ipcMain.handle("workspace:save-preferences", (event, value: unknown) => { if (!senderWindow(event)) throw new Error("Invalid preferences request."); if (!value || typeof value !== "object") throw new Error("Invalid workspace preferences."); const preferences = workspaceRuntime.store.savePreferences(validatePreferences({ ...workspaceRuntime.store.getPreferences(), ...value })); taskNotifications.configure(preferences); return preferences; });
ipcMain.handle("workspace:mcp", (event, value: unknown) => {
	if (!senderWindow(event)) throw new Error("Invalid MCP request.");
	return workspaceRuntime.mcp(validateMcpCommand(value));
});
ipcMain.handle("workspace:terminals", event => {
	if (!senderWindow(event)) throw new Error("Invalid terminal request.");
	return terminalService.get();
});
ipcMain.handle("workspace:terminal", (event, command: unknown) => {
	if (!senderWindow(event)) throw new Error("Invalid terminal request.");
	if (command && typeof command === "object" && "type" in command && command.type === "open" && "projectId" in command && typeof command.projectId === "string") workspaceRuntime.assertProjectAvailable(command.projectId);
	return terminalService.command(command);
});
ipcMain.handle("workspace:link-title", (event, value: unknown) => { if (!senderWindow(event) || typeof value !== "string") throw new Error("Invalid link."); return linkTitle(value); });
ipcMain.handle("workspace:open-link", async (event, value: unknown) => {
	if (!senderWindow(event) || typeof value !== "string") throw new Error("Invalid link.");
	const url = new URL(value);
	if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Use a web link.");
	await shell.openExternal(url.href);
});
/** A login waiting for its authenticator code, by window: the next code, a new sign-in or a cancel ends it. */
const phaseoSecondFactors = new Map<number, { accountId?: string; session: PhaseoSession; factorId: string }>();
function phaseoSignInMethod(value: unknown): PhaseoSignInMethod {
	const method = value && typeof value === "object" ? value as Record<string, unknown> : {};
	if (typeof method.provider === "string" && (PHASEO_PROVIDERS as readonly string[]).includes(method.provider)) return { provider: method.provider as PhaseoProvider };
	if (typeof method.email === "string" && typeof method.password === "string" && method.email.length <= 320 && /^[^\s@]+@[^\s@]+$/.test(method.email.trim()) && method.password && method.password.length <= 1024) return { email: method.email.trim(), password: method.password };
	throw new Error("Choose how to sign in to Phaseo.");
}
/** Runs one step of a Phaseo sign-in for a window, which a cancel, the window closing or the app quitting stops. */
async function phaseoSignInStep<T>(event: Electron.IpcMainInvokeEvent, step: (owner: BrowserWindow, signal: AbortSignal) => Promise<T>) {
	const owner = senderWindow(event);
	if (!owner || shutdownStarted) throw new Error("Phaseo sign-in is unavailable.");
	if (phaseoSignIns.has(event.sender.id)) throw new Error("Phaseo sign-in is already open.");
	const controller = new AbortController(); phaseoSignIns.set(event.sender.id, controller);
	const destroyed = () => controller.abort(); owner.webContents.once("destroyed", destroyed);
	try {
		// Claimed before this await, so a cancel or a closing window during the check still stops the sign-in.
		if (!await credentialVault.available()) throw new Error("Phaseo sign-in is unavailable.");
		if (controller.signal.aborted || shutdownStarted) throw new Error("Sign-in canceled.");
		return await step(owner, controller.signal);
	}
	catch (error) { if (controller.signal.aborted) throw new Error("Sign-in canceled.", { cause: error }); throw error; }
	finally { owner.webContents.removeListener("destroyed", destroyed); phaseoSignIns.delete(event.sender.id); }
}
/** Signs in to Phaseo itself (see phaseoLogin.ts): in the browser, or with an email and password typed into the app. */
ipcMain.handle("workspace:phaseo-sign-in", (event, accountId: unknown, method: unknown) => {
	if (accountId !== undefined && typeof accountId !== "string") throw new Error("Phaseo sign-in is unavailable.");
	const chosen = phaseoSignInMethod(method);
	return phaseoSignInStep(event, async (owner, signal): Promise<PhaseoSignInResult> => {
		phaseoSecondFactors.delete(event.sender.id);
		const session = "provider" in chosen
			? await browserSignIn({ provider: chosen.provider, signal, openBrowser: url => shell.openExternal(url) })
			: await passwordSignIn(chosen.email, chosen.password, fetch, signal);
		if (signal.aborted || shutdownStarted || owner.isDestroyed()) throw new Error("Sign-in canceled.");
		const factorId = await secondFactor(session, fetch, signal);
		if (factorId) { phaseoSecondFactors.set(event.sender.id, { accountId, session, factorId }); return { secondFactor: true }; }
		return savePhaseoLogin(owner, accountId, session, signal);
	});
});
ipcMain.handle("workspace:phaseo-verify-sign-in", (event, code: unknown) => {
	if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) throw new Error("Enter the 6-digit code from your authenticator app.");
	return phaseoSignInStep(event, async (owner, signal): Promise<PhaseoSignInResult> => {
		const pending = phaseoSecondFactors.get(event.sender.id);
		if (!pending) throw new Error("Start signing in again.");
		// A wrong code keeps the login waiting, so the person can try another.
		const session = await verifySecondFactor(pending.session, pending.factorId, code.trim(), fetch, signal);
		phaseoSecondFactors.delete(event.sender.id);
		if (signal.aborted || shutdownStarted || owner.isDestroyed()) throw new Error("Sign-in canceled.");
		return savePhaseoLogin(owner, pending.accountId, session, signal);
	});
});
/**
 * Keeps a Phaseo login and the gateway key it gets (in the person's default workspace), as a new account or in place of
 * an existing account's sign-in, whose key is then revoked and login ended.
 */
async function savePhaseoLogin(owner: BrowserWindow, accountId: string | undefined, session: PhaseoSession, signal: AbortSignal) {
	const existing = accountId ? workspaceRuntime.store.getAccounts().find(account => account.id === accountId && account.harness === "phaseo" && account.oauthExpiresAt && !account.archived) : undefined;
	if (accountId && !existing) throw new Error("Choose an active Phaseo sign-in account.");
	const accountIdToSave = existing?.id ?? randomUUID();
	const releaseAccount = workspaceRuntime.beginAccountSignIn(accountIdToSave);
	try {
		const issued = await issuePhaseoKey(session, undefined, fetch, signal);
		const keySecret = randomUUID(), sessionSecret = randomUUID();
		try {
			if (signal.aborted || shutdownStarted || owner.isDestroyed()) throw new Error("Sign-in canceled.");
			await credentialVault.set(keySecret, issued.key); await credentialVault.set(sessionSecret, JSON.stringify(session));
			if (signal.aborted || shutdownStarted || owner.isDestroyed()) throw new Error("Sign-in canceled.");
			const current = existing ? workspaceRuntime.store.getAccounts().find(account => account.id === existing.id && !account.archived) : undefined;
			if (existing && !current) throw new Error("Account is unavailable.");
			workspaceRuntime.store.saveAccount({ ...current, id: accountIdToSave, name: current?.name ?? "Phaseo", harness: "phaseo", kind: "api", endpoint: PHASEO_GATEWAY_ENDPOINT, secretId: keySecret, sessionSecretId: sessionSecret, phaseoWorkspaceId: issued.workspaceId, configured: true, oauthExpiresAt: issued.expiresAt });
		} catch (error) { credentialVault.remove(keySecret); credentialVault.remove(sessionSecret); void revokePhaseoKey(issued.key); throw error; }
		if (existing) void retirePhaseoSignIn(existing);
		const state = workspaceRuntime.store.getOverview(); workspaceRuntime.onChange(state);
		void refreshPhaseoSignIns(accountIdToSave);
		// The catalog starts downloading now rather than when the model picker first opens.
		void discoverDesktopModels("phaseo", accountIdToSave).catch(() => {});
		return { workspace: state, accountId: accountIdToSave };
	} finally { releaseAccount(); }
}
/** Lets go of a sign-in a new one replaced: its key is revoked and its login ended, both best effort. */
async function retirePhaseoSignIn(account: Account) {
	const keySecret = account.secretId ?? account.id;
	const [key, session] = await Promise.all([
		credentialVault.get(keySecret).catch(() => undefined),
		account.sessionSecretId ? credentialVault.get(account.sessionSecretId).then(parsePhaseoSession).catch(() => undefined) : undefined,
	]);
	credentialVault.remove(keySecret); if (account.sessionSecretId) credentialVault.remove(account.sessionSecretId);
	await Promise.all([key && revokePhaseoKey(key), session && signOutPhaseo(session)]);
}
const phaseoSessionReads = new Map<string, Promise<PhaseoSession>>();
/**
 * An account's Phaseo login with an access token good for a few minutes more. An older one is refreshed, once however
 * many ask, and kept at once: the refresh token it used stops working.
 */
function phaseoSession(account: Account): Promise<PhaseoSession> {
	const secretId = account.sessionSecretId;
	if (!secretId) return Promise.reject(new Error("Sign in to Phaseo again."));
	const running = phaseoSessionReads.get(secretId);
	if (running) return running;
	const read = credentialVault.get(secretId).then(parsePhaseoSession).then(async stored => {
		if (stored.expiresAt - Date.now() > 5 * 60_000) return stored;
		const next = await refreshPhaseoSession(stored.refreshToken);
		// Not into a login replaced since.
		if (workspaceRuntime.store.getAccounts().some(value => value.sessionSecretId === secretId)) await credentialVault.set(secretId, JSON.stringify(next));
		return next;
	}).finally(() => phaseoSessionReads.delete(secretId));
	phaseoSessionReads.set(secretId, read);
	return read;
}
/**
 * Keeps each Phaseo sign-in going while the app is used: renews its key once a day (a key lasts 30 days from its last
 * renewal), replaces a key that ran out from the login, and reads who it belongs to for the sidebar's profile, a new
 * sign-in at once and the rest at most daily. A failure keeps what was there: the key's expiry, the last profile (or the
 * initials). An older OAuth sign-in has no login, so its key can only be renewed.
 */
async function refreshPhaseoSignIns(signedIn?: string) {
	for (let account of workspaceRuntime.store.getAccounts()) {
		if (account.harness !== "phaseo" || !account.oauthExpiresAt || account.archived) continue;
		if (signedIn && account.id !== signedIn) continue;
		const expired = Date.parse(account.oauthExpiresAt) <= Date.now();
		if (expired && !account.sessionSecretId) continue;
		const save = (change: Partial<Account>) => {
			const current = workspaceRuntime.store.getAccounts().find(value => value.id === account.id);
			// Not over a sign-in made since (a new key, a new expiry).
			if (!current || shutdownStarted || current.secretId !== account.secretId) return false;
			account = { ...current, ...change };
			workspaceRuntime.store.saveAccount(account);
			workspaceRuntime.onChange(workspaceRuntime.store.getOverview());
			return true;
		};
		try {
			if (expired) {
				const issued = await issuePhaseoKey(await phaseoSession(account), account.phaseoWorkspaceId);
				const oldSecret = account.secretId ?? account.id, secretId = randomUUID();
				await credentialVault.set(secretId, issued.key);
				if (!save({ secretId, oauthExpiresAt: issued.expiresAt, phaseoWorkspaceId: issued.workspaceId })) { credentialVault.remove(secretId); void revokePhaseoKey(issued.key); continue; }
				credentialVault.remove(oldSecret);
			} else if (Date.parse(account.oauthExpiresAt) - Date.now() < 29 * 86_400_000) {
				const oauthExpiresAt = await renewPhaseoKey(await credentialVault.get(account.secretId ?? account.id)).catch(() => undefined);
				if (oauthExpiresAt && oauthExpiresAt > account.oauthExpiresAt) save({ oauthExpiresAt });
			}
			if (!signedIn && account.profile && Date.now() - Date.parse(account.profile.checkedAt) < 86_400_000) continue;
			save({ profile: account.sessionSecretId ? await phaseoAccountProfile(await phaseoSession(account)) : await phaseoProfile(await credentialVault.get(account.secretId ?? account.id)) });
		} catch { /* Kept as it was. */ }
	}
}
ipcMain.handle("workspace:phaseo-cancel-sign-in", event => { if (!senderWindow(event)) throw new Error("Invalid sign-in request."); phaseoSecondFactors.delete(event.sender.id); phaseoSignIns.get(event.sender.id)?.abort(); });
/**
 * Catalogue prices by model, for the Usage page's estimates of what Claude Code and Codex used. They come from the first
 * Phaseo account's catalogue; a catalogue saved before it kept cache prices is fetched again, so cached input isn't
 * priced as fresh input. Without a Phaseo account nothing is priced.
 */
async function usagePrices(): Promise<(model: string) => TokenPrices | undefined> {
	const account = workspaceRuntime.store.getAccounts().find(value => value.harness === "phaseo" && value.configured && !value.archived && value.endpoint);
	if (!account) return () => undefined;
	const cached = await modelCatalogCache.read({ endpoint: account.endpoint!, accountId: account.id });
	let models = cached?.version === CATALOG_VERSION ? cached.models : [];
	if (!models.length) models = await discoverDesktopModels("phaseo", account.id, undefined, true).catch(() => []);
	const prices = new Map<string, TokenPrices>();
	for (const model of models) {
		const facts = model.facts, key = modelMatchKey(model.id);
		if (facts?.inputPrice === undefined || facts.outputPrice === undefined || prices.has(key)) continue;
		// A catalogue without cache prices would price Claude Code's and Codex's cached input (most of it) as fresh input,
		// several times over. Anthropic and OpenAI publish fixed cache rates against the input price, so those stand in.
		const organisation = model.id.split("/")[0], ratios = organisation === "anthropic" ? { read: 0.1, write: 1.25 } : organisation === "openai" ? { read: 0.1, write: 1 } : undefined;
		const cacheRead = facts.cacheReadPrice ?? (ratios ? facts.inputPrice * ratios.read : undefined), cacheWrite = facts.cacheWritePrice ?? (ratios ? facts.inputPrice * ratios.write : undefined);
		prices.set(key, { input: facts.inputPrice, output: facts.outputPrice, ...cacheRead !== undefined ? { cacheRead } : {}, ...cacheWrite !== undefined ? { cacheWrite } : {} });
	}
	return model => prices.get(modelMatchKey(model));
}
let transcriptScanner: TranscriptScanner | undefined;
/** The transcript folders read for the Usage page, with how many recent files each holds; add and remove change the person's own. */
ipcMain.handle("workspace:usage-folders", async (event, request: unknown) => {
	const window = senderWindow(event);
	if (!window) throw new Error("Invalid usage request.");
	const { type, harness, directory } = (request ?? {}) as { type?: unknown; harness?: unknown; directory?: unknown };
	const store = workspaceRuntime.store, added = store.addedTranscriptFolders();
	if (type === "add" && (harness === "claude" || harness === "codex")) {
		const result = await dialog.showOpenDialog(window, { properties: ["openDirectory"], title: harness === "claude" ? "Choose a Claude Code config folder" : "Choose a Codex home folder" });
		if (!result.canceled && result.filePaths[0]) { store.saveAddedTranscriptFolders([...added, { harness, directory: result.filePaths[0] }]); void transcriptScanner?.scan(true); }
	} else if (type === "remove" && typeof directory === "string") store.saveAddedTranscriptFolders(added.filter(folder => folder.directory !== directory));
	else if (type !== "list") throw new Error("Invalid usage request.");
	const folders = transcriptFolders(store.getAccounts(), store.addedTranscriptFolders());
	return Promise.all(folders.map(async (folder: TranscriptFolder) => ({ ...folder, files: (await transcriptFiles(folder)).length })));
});
/** Pull requests you opened and merged since a day, asked of GitHub at most every five minutes per day. */
const pullRequestCountCache = new Map<string, { at: number; counts: Promise<{ opened: number; merged: number } | undefined> }>();
function usagePullRequests(since: string) {
	const cached = pullRequestCountCache.get(since);
	if (cached && Date.now() - cached.at < 5 * 60_000) return cached.counts;
	const projects = workspaceRuntime.store.getProjects().filter(project => { try { workspaceRuntime.assertProjectAvailable(project.id); return true; } catch { return false; } });
	const counts = pullRequestCounts(projects, since).catch(() => undefined);
	pullRequestCountCache.set(since, { at: Date.now(), counts });
	return counts;
}
function discoverDesktopModels(harness: Harness, accountId?: string, projectId?: string, force = false) {
	return span("models.discover", { harness, force }, () => {
		if (harness === "phaseo") return discoverModels(harness, accountId, projectId, force);
		// Counted here rather than per request, so a background refresh also holds off a harness update.
		const discover = () => span("models.harness-list", { harness }, () => modelCheck(harness, () => discoverModels(harness, accountId, projectId, force)));
		return force ? harnessModelCache.refresh(harness, accountId, projectId, discover) : harnessModelCache.get(harness, accountId, projectId, discover);
	});
}
async function discoverModels(harness: Harness, accountId: string | undefined, projectId: string | undefined, force: boolean) {
		const project = projectId ? workspaceRuntime.store.getProjects().find(value => value.id === projectId) : undefined;
		if (projectId && !project) throw new Error("Project is unavailable.");
		const cwd = project?.directory ?? app.getPath("userData");
		const account = accountId ? workspaceRuntime.store.getAccounts().find(value => value.id === accountId && value.harness === harness && value.configured) : undefined;
		if (accountId && !account) throw new Error("Account is unavailable.");
		if (harness === "phaseo") {
			if (account?.oauthExpiresAt && Date.parse(account.oauthExpiresAt) <= Date.now()) throw new Error("Sign in to Phaseo again to renew this account.");
			if (!account) throw new Error("Choose an API account.");
			const key = { endpoint: account.endpoint ?? "", accountId: account.id }, fetchModels = async (validators?: CatalogPageValidator[]) => apiModelCatalog(account, await credentialVault.get(account.secretId ?? account.id), validators);
			return await (force ? modelCatalogCache.refresh(key, fetchModels) : modelCatalogCache.get(key, fetchModels));
		}
		if (harness === "cursor") { if (!account || account.archived) throw new Error("Choose a connected Cursor account."); return await cursorModels(await credentialVault.get(account.secretId ?? account.id)); }
		if (harness === "opencode") return await openCodeModels(cwd, await workspaceRuntime.openCode.connect());
		if (harness === "pi") return await piModels(cwd);
		if (harness === "claude") {
			const [aliases, version] = await Promise.all([claudeNativeModels(cwd, AbortSignal.any([AbortSignal.timeout(15000), modelDiscovery.signal]), account), resolveNativeCommand("claude").then(command => harnessVersion(command, app.getPath("userData"))).catch(() => undefined)]);
			return claudeModelsFor(aliases, version);
		}
		if (harness === "grok") return await grokModelCatalog(cwd, account);
		return await codexModels(cwd, account);
}
async function modelRequest(event: Electron.IpcMainInvokeEvent, harness: unknown, accountId: unknown, projectId: unknown, force: boolean) {
	if (!senderWindow(event) || !["codex", "claude", "phaseo", "opencode", "pi", "cursor", "grok"].includes(String(harness)) || (accountId !== undefined && typeof accountId !== "string") || (projectId !== undefined && typeof projectId !== "string")) throw new Error("Model discovery is unavailable for this harness.");
	workspaceRuntime.assertHarnessAvailable(harness as Harness);
	return await discoverDesktopModels(harness as Harness, accountId as string | undefined, projectId as string | undefined, force);
}
async function modelCheck<T>(harness: Harness, check: () => Promise<T>) {
	modelChecks.set(harness, (modelChecks.get(harness) ?? 0) + 1);
	try { return await check(); }
	finally { const remaining = modelChecks.get(harness)! - 1; if (remaining) modelChecks.set(harness, remaining); else modelChecks.delete(harness); }
}
ipcMain.handle("workspace:models", (event, harness: unknown, accountId: unknown, projectId: unknown) => modelRequest(event, harness, accountId, projectId, false));
// Skips the caches' freshness windows: Phaseo's catalog and the lists local harnesses last gave.
ipcMain.handle("workspace:refresh-models", (event, harness: unknown, accountId: unknown) => modelRequest(event, harness, accountId, undefined, true));
app.on("before-quit", event => {
	if (!workspaceRuntime || shutdownComplete) return;
	event.preventDefault();
	if (shutdownStarted) return;
	shutdownStarted = true;
	browserHost.downloads.close();
	diagnostics.close();
	missionService?.close();
	if (settleTimer) clearInterval(settleTimer);
	if (worktreeCleanupTimer) clearInterval(worktreeCleanupTimer);
	if (phaseoSignInTimer) clearInterval(phaseoSignInTimer);
	void pullRequestWatcher?.close();
	void issueWatcher?.close();
	taskNotifications?.dismiss();
	terminalService?.close();
	for (const controller of signIns.values()) controller.abort();
	for (const controller of phaseoSignIns.values()) controller.abort();
	modelDiscovery.abort();
	harnessUpdate?.controller.abort();
	for (const controller of accountChecks.values()) controller.abort();
	for (const controller of agentChecks.values()) controller.abort();
	for (const controller of nativeCatalogChecks) controller.abort();
	// Stop renderer IPC before the runtime closes its database.
	for (const window of BrowserWindow.getAllWindows()) window.destroy();
	// A hung shutdown (a process that won't die, a stuck run) must not leave an invisible app holding the database.
	const deadline = setTimeout(() => { console.error("Shutdown timed out; quitting anyway."); stopTracing(); shutdownComplete = true; app.exit(0); }, 10_000);
	// Factory saves its running stages as interrupted before the runtime stops their threads.
	const factoryClosed = (factoryService?.shutdown() ?? Promise.resolve()).catch(() => { console.error("Factory shutdown failed."); });
	void Promise.allSettled([factoryClosed.then(() => workspaceRuntime.close()).catch(() => { console.error("Workspace shutdown failed."); }), harnessUpdate?.completed, closeBackgroundCommands(), closePhaseoMcpPool()]).finally(() => { clearTimeout(deadline); stopTracing(); shutdownComplete = true; app.quit(); });
});

ipcMain.handle("workspace:sign-in", async (event, id: unknown) => {
	if (!senderWindow(event) || typeof id !== "string") throw new Error("Invalid sign-in request.");
	const account = workspaceRuntime.store.getAccounts().find(value => value.id === id);
	if (!account) throw new Error("Account no longer exists.");
	if (account.kind !== "native" || account.archived) throw new Error("Choose an active native account for sign-in.");
	if (signIns.has(id) || accountChecks.has(id)) throw new Error("Sign-in or an account check is already in progress.");
	const releaseAccount = workspaceRuntime.beginAccountSignIn(id);
	const controller = new AbortController(); signIns.set(id, controller);
	try {
		if (account.harness === "cursor") {
			if (!await credentialVault.available()) throw new Error("Secure credential storage is unavailable on this device.");
			const result = await cursorSignIn(url => shell.openExternal(url), controller.signal);
			if (shutdownStarted || controller.signal.aborted) throw new Error("Sign-in cancelled."); const current = workspaceRuntime.store.getAccounts().find(value => value.id === account.id && !value.archived); if (!current) throw new Error("Account is unavailable.");
			const oldSecret = current.secretId ?? current.id; const newSecret = randomUUID(); await credentialVault.set(newSecret, result.apiKey);
			if (shutdownStarted || controller.signal.aborted) { credentialVault.remove(newSecret); throw new Error("Sign-in cancelled."); }
			current.secretId = newSecret; current.configured = true;
			try { workspaceRuntime.store.saveAccount(current); } catch (error) { credentialVault.remove(newSecret); throw error; } credentialVault.remove(oldSecret);
		} else {
			await signInNative(account, url => shell.openExternal(url), controller.signal);
			if (shutdownStarted || controller.signal.aborted) throw new Error("Sign-in cancelled.");
			if (account.harness === "grok") {
				const status = await grokAccountStatus(account.configDirectory!, account, AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]));
				if (status.authenticated !== true) throw new Error("Grok did not confirm this profile is signed in.");
				if (shutdownStarted || controller.signal.aborted) throw new Error("Sign-in cancelled.");
			}
			const current = workspaceRuntime.store.getAccounts().find(value => value.id === account.id); if (!current) throw new Error("Account no longer exists.");
			current.configured = true; workspaceRuntime.store.saveAccount(current);
		}
		const state = workspaceRuntime.store.getOverview(); workspaceRuntime.onChange(state); return state;
	} finally { signIns.delete(id); releaseAccount(); }
});
ipcMain.handle("workspace:cancel-sign-in", (event, id: unknown) => {
	if (!senderWindow(event) || typeof id !== "string") throw new Error("Invalid sign-in request.");
	signIns.get(id)?.abort();
});
// CLIProxyAPI hubs: their accounts' limits, read through the hub with keys kept in the credential vault.
let usageHubs: UsageHubs | undefined;
ipcMain.handle("workspace:usage-hubs", async (event, request: unknown) => {
	if (!senderWindow(event)) throw new Error("Untrusted usage hub request.");
	if (!usageHubs) throw new Error("Usage hubs are not ready yet.");
	return usageHubs.request(validateUsageHubRequest(request));
});
ipcMain.handle("workspace:account-status", async (event, harness: unknown, id: unknown) => {
	if (!senderWindow(event) || (harness !== "codex" && harness !== "claude" && harness !== "cursor" && harness !== "grok") || (id !== undefined && typeof id !== "string")) throw new Error("Invalid account status request.");
	const account = id ? workspaceRuntime.store.getAccounts().find(value => value.id === id && value.harness === harness && (value.kind === "native" || harness === "cursor")) : undefined;
	if (id && !account) throw new Error("Account no longer exists.");
	workspaceRuntime.assertHarnessAvailable(harness);
	const key = id as string | undefined ?? harness; const running = accountStatusRuns.get(key); if (running) return running;
	if (accountChecks.has(key) || (id && signIns.has(id))) throw new Error("An account check or sign-in is already in progress.");
	const controller = new AbortController(); accountChecks.set(key, controller);
	const run = (async () => {
		const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]);
		const cwd = account?.configDirectory ?? app.getPath("userData");
		const status = harness === "cursor" ? await cursorAccountStatus(account?.configured ? await credentialVault.get(account.secretId ?? account.id) : undefined) : harness === "grok" ? await grokAccountStatus(cwd, account, signal) : await nativeAccountStatus(harness, cwd, account, signal);
		if (shutdownStarted) throw new Error("The workspace is shutting down.");
		if (account && status.authenticated !== null) { const current = workspaceRuntime.store.getAccounts().find(value => value.id === account.id); if (current) { current.configured = status.authenticated; workspaceRuntime.store.saveAccount(current); workspaceRuntime.onChange(workspaceRuntime.store.getOverview()); } }
		return status;
	})().finally(() => { accountChecks.delete(key); accountStatusRuns.delete(key); });
	accountStatusRuns.set(key, run);
	return run;
});
ipcMain.handle("workspace:check-agent", async (event, id: unknown) => {
	if (!senderWindow(event) || typeof id !== "string") throw new Error("Invalid agent check.");
	const agent = workspaceRuntime.store.getAgents().find(value => value.id === id); if (!agent) throw new Error("Agent no longer exists.");
	if (agentChecks.has(id)) throw new Error("This agent is already being checked.");
	const controller = new AbortController(); agentChecks.set(id, controller);
	try { return await checkAcpAgent(agent, app.getPath("userData"), AbortSignal.any([controller.signal, AbortSignal.timeout(30000)])); }
	finally { agentChecks.delete(id); }
});

function nativeActionDraft(value: unknown): { id?: string; harness: Harness; accountId?: string; projectId?: string } {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid native action request.");
	const { harness, accountId, projectId } = value as Record<string, unknown>;
	if (typeof harness !== "string" || (accountId !== undefined && typeof accountId !== "string") || (projectId !== undefined && typeof projectId !== "string")) throw new Error("Invalid native action request.");
	return { harness: harness as Harness, accountId, projectId };
}
function projectRoot(event: Electron.IpcMainInvokeEvent, id: unknown) {
	if (!senderWindow(event) || typeof id !== "string") throw new Error("Invalid project request.");
	const project = workspaceRuntime.store.getProjects().find(value => value.id === id);
	if (!project) throw new Error("Project no longer exists.");
	workspaceRuntime.assertProjectAvailable(project.id);
	return project.directory;
}
ipcMain.handle("workspace:native-actions", async (event, id: unknown) => {
 if (!senderWindow(event)) throw new Error("Invalid native action request."); if (shutdownStarted) throw new Error("The workspace is shutting down.");
 // A new chat has no task yet: it asks with the harness, account and project it is about to use.
 const task = typeof id === "string" ? workspaceRuntime.store.getTask(id) : nativeActionDraft(id); if (!["opencode", "pi", "claude", "codex", "phaseo"].includes(task.harness)) throw new Error("Native action discovery is unavailable for this harness.");
 workspaceRuntime.assertHarnessAvailable(task.harness); const cwd = task.projectId ? projectRoot(event, task.projectId) : task.id ? path.join(app.getPath("userData"), "tasks", task.id) : path.join(app.getPath("userData"), "scratch");
 const account = (task.harness === "claude" || task.harness === "codex") && task.accountId ? workspaceRuntime.store.getAccounts().find(value => value.id === task.accountId && value.harness === task.harness && value.kind === "native" && value.configured && !value.archived) : undefined;
 if ((task.harness === "claude" || task.harness === "codex") && task.accountId && !account) throw new Error("Account is unavailable."); if (account && (signIns.has(account.id) || accountChecks.has(account.id))) throw new Error("Finish this account's sign-in or check before loading commands.");
 const controller = new AbortController(); nativeCatalogChecks.add(controller); if (account) accountChecks.set(account.id, controller); modelChecks.set(task.harness, (modelChecks.get(task.harness) ?? 0) + 1);
 try { if (!task.projectId) await mkdir(cwd, { recursive: true }); const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]); if (task.harness === "phaseo") return await new PhaseoSkills(path.join(app.getPath("userData"), "workspace"), task.projectId ? cwd : undefined).catalog(signal); if (task.harness === "codex") return await codexNativeActions(cwd, signal, account); if (task.harness === "claude") return await claudeNativeActions(cwd, signal, account); if (task.harness === "pi") return await piNativeActions(cwd, signal); const endpoint = await workspaceRuntime.openCode.connect(signal); return await openCodeNativeActions(OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) }), cwd, signal); }
 finally { nativeCatalogChecks.delete(controller); if (account && accountChecks.get(account.id) === controller) accountChecks.delete(account.id); const remaining = modelChecks.get(task.harness)! - 1; if (remaining) modelChecks.set(task.harness, remaining); else modelChecks.delete(task.harness); }
});
ipcMain.handle("workspace:prompt-commands", (event, id: unknown, request: unknown) => {
	if (!senderWindow(event)) throw new Error("Untrusted command request.");
	const project = id === undefined ? undefined : projectRoot(event, id);
	return new PromptCommands(app.getPath("userData"), project).request(request);
});
ipcMain.handle("workspace:mcp-prompts", async (event, id: unknown, request: unknown) => {
 if (!senderWindow(event) || typeof id !== "string") throw new Error("Invalid MCP prompt request.");
 if (shutdownStarted) throw new Error("The workspace is shutting down.");
 if (!request || typeof request !== "object" || Array.isArray(request) || !("requestId" in request) || typeof request.requestId !== "string" || !/^[a-f0-9-]{36}$/.test(request.requestId)) throw new Error("Invalid MCP prompt request identity.");
 const requestId = request.requestId;
 if ("type" in request && request.type === "cancel") {
  const pending = mcpPromptChecks.get(requestId);
  if (pending?.taskId === id && pending.senderId === event.sender.id) pending.controller.abort();
  return { prompts: [] };
 }
 if (mcpPromptChecks.has(requestId) || [...mcpPromptChecks.values()].some(value => value.taskId === id && value.senderId === event.sender.id && !value.controller.signal.aborted)) throw new Error("MCP prompt loading is already in progress.");
 const task = workspaceRuntime.store.getTask(id), cwd = task.projectId ? projectRoot(event, task.projectId) : path.join(app.getPath("userData"), "tasks", task.id);
 const controller = new AbortController(); nativeCatalogChecks.add(controller);
 mcpPromptChecks.set(requestId, { controller, taskId: id, senderId: event.sender.id });
 const abort = () => controller.abort(); event.sender.once("destroyed", abort);
 try {
  if (!task.projectId) await mkdir(cwd, { recursive: true });
  return await new McpPromptCatalogService(await workspaceRuntime.resolvedMcpConnections(task.projectId), cwd, task.projectId).request(request, AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]));
 } finally { event.sender.removeListener("destroyed", abort); mcpPromptChecks.delete(requestId); nativeCatalogChecks.delete(controller); }
});
ipcMain.handle("workspace:search-files", (event, id: unknown, query: unknown) => { const root = projectRoot(event, id); return span("files.search", undefined, () => searchProjectFiles(root, query as string)); });
ipcMain.handle("workspace:search-contents", (event, id: unknown, query: unknown) => { const root = projectRoot(event, id); return span("files.searchContents", undefined, () => searchProjectContents(root, query)); });
ipcMain.handle("workspace:list-files", (event, id: unknown, directory: unknown) => {
	const root = projectRoot(event, id);
	if (typeof directory !== "string") throw new Error("Invalid directory.");
	return listProjectFiles(root, directory);
});
ipcMain.handle("workspace:editors", event => {
	if (!senderWindow(event)) throw new Error("Untrusted editor request.");
	return editorInstallations();
});
ipcMain.handle("workspace:open-project", (event, id: unknown, request: unknown) => openProjectTarget(projectRoot(event, id), request, {
	find: findEditor, launch: launchEditor, reveal: filename => shell.showItemInFolder(filename), openFolder: directory => shell.openPath(directory),
}));
ipcMain.handle("workspace:read-file", (event, id: unknown, filename: unknown) => {
	const root = projectRoot(event, id);
	if (typeof filename !== "string") throw new Error("Invalid filename.");
	return readProjectFile(root, filename);
});
ipcMain.handle("workspace:git-review", (event, id: unknown) => { const root = projectRoot(event, id); return span("git.review", undefined, () => gitReview(root)); });
ipcMain.handle("workspace:pull-requests", (event, id: unknown, cursor: unknown) => { const root = projectRoot(event, id); return span("gh.pull-requests", { page: cursor !== undefined }, () => projectPullRequests(root, cursor)); });
ipcMain.handle("workspace:github-references", (event, id: unknown, query: unknown) => { const root = projectRoot(event, id), text = validateGithubReferenceQuery(query); return span("gh.github-references", undefined, () => searchGithubReferences(root, text)); });
// Projects being removed or not yet available are left out rather than failing the whole page.
ipcMain.handle("workspace:pull-request-directory", (event, query: unknown) => { if (!senderWindow(event)) throw new Error("Invalid pull request list request."); return listPullRequestDirectory(workspaceRuntime.store.getProjects().filter(project => { try { workspaceRuntime.assertProjectAvailable(project.id); return true; } catch { return false; } }), query); });
ipcMain.handle("workspace:pull-request", async (event, id: unknown, number: unknown) => { const details = await projectPullRequest(projectRoot(event, id), number); workspaceRuntime.syncPullRequestSnapshot(details.repository, details.number, pullRequestLinkSnapshot(details)); return details; });
ipcMain.handle("workspace:pull-request-candidates", (event, id: unknown, query: unknown) => projectPullRequestCandidates(projectRoot(event, id), query));
ipcMain.handle("workspace:pull-request-view", async (event, id: unknown, number: unknown) => { const view = await projectPullRequestView(projectRoot(event, id), number); workspaceRuntime.syncPullRequestSnapshot(view.repository, view.number, pullRequestLinkSnapshot(view)); return view; });
ipcMain.handle("workspace:pull-request-action", async (event, id: unknown, request: unknown) => { const root = projectRoot(event, id); if (shutdownStarted) throw new Error("The workspace is shutting down."); const view = await projectPullRequestAction(root, request); workspaceRuntime.syncPullRequestSnapshot(view.repository, view.number, pullRequestLinkSnapshot(view)); return view; });
ipcMain.handle("workspace:branch-pull-request", (event, id: unknown, fresh: unknown) => branchPullRequest(projectRoot(event, id), fresh === true));
ipcMain.handle("workspace:create-pull-request", async (event, id: unknown, taskId: unknown) => {
	const root = projectRoot(event, id);
	if (typeof id !== "string" || (taskId !== undefined && typeof taskId !== "string") || shutdownStarted) throw new Error("Invalid pull request request.");
	const result = await workspaceRuntime.mutateProject(id, () => createPullRequest(root));
	forgetBranchPullRequest(root);
	// T3 links the pull request a Git action creates to the chat it ran beside, as "Created from this chat".
	const task = typeof taskId === "string" ? workspaceRuntime.store.getOverview().tasks.find(value => value.id === taskId) : undefined;
	if (task) await workspaceRuntime.command({ type: "link-pull-request", id: task.id, reference: result.url, source: "created" }).catch(() => undefined);
	return { ...result, workspace: workspaceRuntime.store.getOverview() };
});
ipcMain.handle("workspace:project-repository", async (event, id: unknown) => {
	const root = projectRoot(event, id);
	try { return githubRepository(await git(root, ["remote", "get-url", "origin"])); } catch { return null; }
});
ipcMain.handle("workspace:pull-request-stack", async (event, id: unknown, number: unknown, fresh: unknown) => {
	const root = projectRoot(event, id);
	if (!Number.isSafeInteger(number) || Number(number) < 1 || typeof fresh !== "boolean") throw new Error("Invalid stack request.");
	const repository = githubRepository(await git(root, ["remote", "get-url", "origin"]).catch(() => { throw new Error("Choose a Git repository with an origin remote."); }));
	const read = await readPullRequestStack(root, repository, Number(number), fresh);
	workspaceRuntime.syncPullRequestStack(repository, Number(number), read.stack);
	return read;
});
ipcMain.handle("workspace:pull-request-stack-action", async (event, id: unknown, request: unknown) => {
	const root = projectRoot(event, id);
	if (shutdownStarted) throw new Error("The workspace is shutting down.");
	const repository = githubRepository(await git(root, ["remote", "get-url", "origin"]).catch(() => { throw new Error("Choose a Git repository with an origin remote."); }));
	const result = await runPullRequestStackAction(root, repository, request);
	const number = (request as { number: number }).number, read = await readPullRequestStack(root, repository, number, true).catch(() => undefined);
	if (read) workspaceRuntime.syncPullRequestStack(repository, number, read.stack);
	return result;
});
ipcMain.handle("workspace:pull-request-contents", (event, id: unknown, query: unknown) => projectPullRequestContents(projectRoot(event, id), query));
ipcMain.handle("workspace:pull-request-files", (event, id: unknown, query: unknown) => projectPullRequestFiles(projectRoot(event, id), query));
ipcMain.handle("workspace:pull-request-behind", (event, id: unknown, query: unknown) => projectPullRequestBehind(projectRoot(event, id), query));
ipcMain.handle("workspace:pull-request-files-viewed", (event, id: unknown, number: unknown) => projectPullRequestFilesViewed(projectRoot(event, id), number));
ipcMain.handle("workspace:pull-request-set-files-viewed", (event, id: unknown, request: unknown) => { const root = projectRoot(event, id); if (shutdownStarted) throw new Error("The workspace is shutting down."); return projectSetPullRequestFilesViewed(root, request); });
ipcMain.handle("workspace:pull-request-threads", (event, id: unknown, query: unknown) => projectPullRequestThreads(projectRoot(event, id), query));
ipcMain.handle("workspace:git-hunks", (event, id: unknown, filename: unknown, staged: unknown) => readGitHunks(projectRoot(event, id), filename, staged));
ipcMain.handle("workspace:git-diff-contents", (event, id: unknown, request: unknown) => readGitDiffContents(projectRoot(event, id), request));
ipcMain.handle("workspace:git-command", (event, id: unknown, command: unknown) => { const root = projectRoot(event, id); return workspaceRuntime.mutateProject(id as string, () => gitCommand(root, command)); });
ipcMain.handle("workspace:git-branches", (event, id: unknown) => gitBranches(projectRoot(event, id)));
ipcMain.handle("workspace:turn-changes", (event, id: unknown, from: unknown, to: unknown) => { const root = projectRoot(event, id); if (!isTreeId(from) || !isTreeId(to)) throw new Error("This turn has no saved snapshot."); return turnChanges(root, from, to); });
ipcMain.handle("workspace:git-commit-message", (event, id: unknown) => { const root = projectRoot(event, id); return span("git.commit-message", undefined, () => generateCommitMessage(root, input => workspaceRuntime.completeWithTitleModel(input))); });
ipcMain.handle("workspace:git-init", (event, id: unknown) => { const root = projectRoot(event, id); return workspaceRuntime.mutateProject(id as string, () => gitInit(root)); });
ipcMain.handle("workspace:publish-owners", (event, id: unknown) => publishOwners(projectRoot(event, id)));
ipcMain.handle("workspace:publish-repository", async (event, id: unknown, request: unknown) => {
	const root = projectRoot(event, id), input = validatePublishRepository(request);
	if (shutdownStarted) throw new Error("The workspace is shutting down.");
	return workspaceRuntime.mutateProject(id as string, async () => withGitLock(root, async () => ({ ...await publishRepository(root, input, gitPush), review: await gitReview(root) })));
});
ipcMain.handle("workspace:git-diff", async (event, id: unknown, request: unknown) => { const root = projectRoot(event, id), { patch, hash, truncated, headRef, baseRef, repository } = await span("git.diff", undefined, () => gitScopedDiff(root, request)); return { patch, hash, truncated, headRef, baseRef, repository }; });
ipcMain.handle("workspace:git-diff-file", (event, id: unknown, request: unknown) => { const root = projectRoot(event, id); return span("git.diff-file", undefined, () => readScopedDiffContents(root, request)); });
ipcMain.handle("workspace:git-refs", (event, id: unknown) => { const root = projectRoot(event, id); return span("git.refs", undefined, () => gitRefs(root)); });
ipcMain.handle("workspace:project-tree", (event, id: unknown, request: unknown, refresh: unknown) => { const root = projectRoot(event, id); if (refresh === true) refreshProjectIndex(root); return projectTree(root, request); });
// Replies name images by absolute path as often as by relative one; either must be inside the project.
ipcMain.handle("workspace:file-preview", async (event, id: unknown, filename: unknown) => { const root = projectRoot(event, id); if (typeof filename !== "string") throw new Error("Invalid file request."); return readFilePreview(root, await projectRelativePath(root, filename), extractPdfText); });
ipcMain.handle("workspace:create-worktree", (event, id: unknown, branch: unknown, base: unknown) => {
	projectRoot(event, id);
	if (typeof id !== "string" || typeof branch !== "string" || typeof base !== "string") throw new Error("Invalid worktree request.");
	return workspaceRuntime.createWorktree(id, branch, base);
});
ipcMain.handle("workspace:pull-request-worktree", async (event, id: unknown, number: unknown) => {
	const root = projectRoot(event, id);
	if (typeof id !== "string" || shutdownStarted) throw new Error("Invalid worktree request.");
	const view = await projectPullRequestView(root, number);
	const result = await checkoutPullRequestWorktree(root, view, async (branch, base) => { const created = await workspaceRuntime.createWorktree(id, branch, base); return { projectId: created.projectId, directory: workspaceRuntime.store.getProjects().find(project => project.id === created.projectId)?.directory }; });
	return { workspace: workspaceRuntime.store.getOverview(), projectId: result.projectId, branch: result.branch };
});
ipcMain.handle("workspace:pull-request-guide", async (event, id: unknown, number: unknown, write: unknown) => {
	const root = projectRoot(event, id);
	if (typeof write !== "boolean" || shutdownStarted) throw new Error("Invalid guide request.");
	const view = await projectPullRequestView(root, number);
	return write ? pullRequestGuides.generate(root, view) : pullRequestGuides.get(view);
});
ipcMain.handle("workspace:pull-request-checkout-here", async (event, id: unknown, number: unknown) => {
	const root = projectRoot(event, id);
	if (typeof id !== "string" || shutdownStarted) throw new Error("Invalid checkout request.");
	const view = await projectPullRequestView(root, number);
	const result = await workspaceRuntime.mutateProject(id, () => checkoutPullRequestHere(root, view));
	return { workspace: workspaceRuntime.store.getOverview(), projectId: id, branch: result.branch };
});
ipcMain.handle("workspace:start-worktree-chat", (event, value: unknown) => {
	const { create, ...rest } = value && typeof value === "object" ? value as Record<string, unknown> : {};
	const request = validateWorktreeChatRequest(rest); projectRoot(event, request.projectId);
	const command = validateCommand(create);
	if (command.type !== "create-task" || shutdownStarted) throw new Error("Invalid worktree chat request.");
	return workspaceRuntime.startWorktreeChat(request, command);
});
ipcMain.handle("workspace:answer-secret", (event, taskId: unknown, requestId: unknown, value: unknown) => {
	if (!senderWindow(event) || typeof taskId !== "string" || typeof requestId !== "string" || !/^[0-9a-f]{32}$/.test(requestId)) throw new Error("Invalid secret answer.");
	return workspaceRuntime.answerSecret(taskId, requestId, validateSecretAnswer(value));
});
ipcMain.handle("workspace:quit-interrupted", event => { if (!senderWindow(event)) throw new Error("Invalid request."); return workspaceRuntime.quitInterrupted(); });
ipcMain.handle("workspace:worktree-cleanup", async (event, value: unknown) => {
	if (!senderWindow(event) || shutdownStarted) throw new Error("Invalid worktree cleanup request.");
	const request = validateWorktreeCleanupRequest(value);
	const report = await workspaceRuntime.cleanWorktrees(request.type === "plan" ? "plan" : { remove: request.projectIds });
	return { report, last: workspaceRuntime.lastWorktreeCleanup, workspace: workspaceRuntime.store.getOverview() };
});
ipcMain.handle("workspace:remove-worktree", (event, id: unknown) => {
	if (!senderWindow(event) || typeof id !== "string") throw new Error("Invalid worktree request.");
	return workspaceRuntime.removeWorktree(id);
});
ipcMain.handle("workspace:read-document", async (event, id: unknown, filename: unknown) => {
	const root = projectRoot(event, id);
	if (typeof filename !== "string") throw new Error("Invalid file request.");
	const text = await readProjectFile(root, filename);
	return { text, hash: contentHash(text) };
});
ipcMain.handle("workspace:write-document", async (event, id: unknown, filename: unknown, text: unknown, expectedHash: unknown) => {
	const root = projectRoot(event, id);
	if (typeof filename !== "string" || typeof text !== "string" || typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error("Invalid file edit.");
	return workspaceRuntime.mutateProject(id as string, () => writeProjectFile(root, filename, text, expectedHash));
});

ipcMain.handle("workspace:get", event => {
	if (shutdownStarted) return;
	if (!senderWindow(event)) throw new Error("Untrusted workspace request.");
	return workspaceRuntime.store.get();
});
ipcMain.handle("workspace:overview", event => {
	if (shutdownStarted) return;
	if (!senderWindow(event)) throw new Error("Untrusted workspace request.");
	return workspaceRuntime.store.getOverview();
});
ipcMain.handle("workspace:task-history", (event, query: unknown) => {
	if (shutdownStarted) return;
	if (!senderWindow(event)) throw new Error("Untrusted workspace request.");
	return workspaceRuntime.store.taskHistory(query);
});
ipcMain.handle("workspace:checkpoint-changes", (event, taskId: unknown, messageId: unknown) => {
	if (!senderWindow(event) || shutdownStarted || typeof taskId !== "string" || typeof messageId !== "string" || !taskId || !messageId || taskId.length > 200 || messageId.length > 200) throw new Error("Invalid checkpoint request.");
	return workspaceRuntime.checkpointChanges(taskId, messageId);
});
ipcMain.handle("workspace:task", (event, id: unknown) => {
	if (shutdownStarted) return;
	if (!senderWindow(event) || typeof id !== "string" || !id || id.length > 200) throw new Error("Invalid task request.");
	return workspaceRuntime.store.getTaskView(id);
});
ipcMain.handle("workspace:conversation-page", (event, query: unknown) => {
	if (shutdownStarted) return;
	if (!senderWindow(event)) throw new Error("Untrusted workspace request.");
	return workspaceRuntime.store.conversationPage(query);
});
ipcMain.handle("workspace:conversation-find", (event, query: unknown) => {
	if (shutdownStarted) return;
	if (!senderWindow(event)) throw new Error("Untrusted workspace request.");
	return workspaceRuntime.store.findInConversation(query);
});
ipcMain.handle("workspace:search-messages", (event, query: unknown) => {
	if (shutdownStarted) return [];
	if (!senderWindow(event)) throw new Error("Untrusted workspace request.");
	return workspaceRuntime.store.searchMessages(query);
});
ipcMain.handle("workspace:export-task", async (event, id: unknown, format: unknown) => {
	const window = senderWindow(event);
	if (!window || typeof id !== "string" || (format !== "markdown" && format !== "json")) throw new Error("Invalid conversation export.");
	const task = workspaceRuntime.store.getTask(id);
	const extension = format === "markdown" ? "md" : "json";
	const result = await dialog.showSaveDialog(window, { title: "Export conversation", defaultPath: exportFilename(task.title, format), filters: [{ name: format === "markdown" ? "Markdown" : "JSON with files", extensions: [extension] }] });
	if (result.canceled || !result.filePath) return false;
	if (shutdownStarted) throw new Error("The workspace is shutting down.");
	const content = await taskExport(task, format, workspaceRuntime.attachments);
	await saveTaskExport(result.filePath, content); return true;
});
ipcMain.handle("workspace:import-task", async (event, value: unknown) => {
	const window = senderWindow(event); if (!window) throw new Error("Invalid conversation import.");
	const command = validateCommand(value); if (command.type !== "create-task") throw new Error("Choose a destination for the imported conversation.");
	const result = await dialog.showOpenDialog(window, { title: "Import conversation", properties: ["openFile"], filters: [{ name: "Phaseo conversation", extensions: ["json"] }] });
	if (result.canceled || !result.filePaths[0]) return undefined;
	return workspaceRuntime.importTask(command, await readConversation(result.filePaths[0]));
});
ipcMain.handle("workspace:command", async (event, value: unknown) => {
	if (!senderWindow(event)) throw new Error("Untrusted workspace request.");
	const command = validateCommand(value);
	// Archiving a Phaseo account or changing its endpoint discards its cached catalog; a new key only re-checks it.
	const cached = command.type === "update-account" && (command.archived === true || command.apiKey !== undefined || command.endpoint !== undefined) ? workspaceRuntime.store.getAccounts().find(account => account.id === command.id && account.harness === "phaseo" && account.endpoint) : undefined;
	const result = await workspaceRuntime.command(command);
	if (cached) {
		const key = { endpoint: cached.endpoint!, accountId: cached.id };
		void (command.type === "update-account" && command.archived !== true && command.endpoint === undefined ? modelCatalogCache.expire(key) : modelCatalogCache.remove(key)).catch(() => {});
	}
	return result;
});
ipcMain.handle("workspace:choose-project", async event => {
	const window = senderWindow(event);
	if (!window) throw new Error("Untrusted workspace request.");
	const result = await dialog.showOpenDialog(window, { properties: ["openDirectory"], title: "Open project" });
	if (!result.canceled && result.filePaths[0]) workspaceRuntime.store.addProject(result.filePaths[0]);
	const state = workspaceRuntime.store.getOverview(); workspaceRuntime.onChange(state); return state;
});
// T3's Clone from a remote URL: asks where to put the checkout, clones it and adds it as a project.
ipcMain.handle("workspace:clone-project", async (event, url: unknown) => {
	const window = senderWindow(event);
	if (!window || shutdownStarted) throw new Error("Untrusted workspace request.");
	cloneSource(url);
	const result = await dialog.showOpenDialog(window, { properties: ["openDirectory", "createDirectory"], title: "Choose where to clone", buttonLabel: "Clone here" });
	if (result.canceled || !result.filePaths[0]) return undefined;
	const directory = await span("projects.clone", undefined, () => cloneRepository(url, result.filePaths[0]));
	const project = workspaceRuntime.store.addProject(directory);
	const state = workspaceRuntime.store.getOverview(); workspaceRuntime.onChange(state); return { workspace: state, projectId: project.id };
});
const triageBuild = (): TriageBuild => ({ version: app.getVersion(), ...buildStamp, platform: process.platform, osRelease: release(), arch: process.arch, electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, packaged: app.isPackaged });
/** Where filed issues and offered pull requests go; PHASEO_TRIAGE_REPOSITORY points them at a test repository. */
const triageRepository = () => /^[\w.-]+\/[\w.-]+$/.test(process.env.PHASEO_TRIAGE_REPOSITORY ?? "") ? process.env.PHASEO_TRIAGE_REPOSITORY! : triageSourceRepository;
let triagePreparing: Promise<{ projectId: string }> | undefined;
// Triage: the running build's source as a project, for a Code chat that debugs the app itself.
ipcMain.handle("workspace:triage-prepare", async (event): Promise<TriagePreparation> => {
	if (!senderWindow(event) || shutdownStarted) throw new Error("Untrusted workspace request.");
	// A second request while the first is fetching waits for it rather than fetching again.
	triagePreparing ??= span("triage.prepare", { exact: Boolean(buildStamp.commit) }, async () => {
		const checkout = await prepareTriageCheckout(path.join(app.getPath("userData"), "triage"), buildStamp.commit);
		const project = workspaceRuntime.store.addProject(checkout.directory);
		const { version } = triageBuild();
		project.name = `Phaseo ${version} source`;
		project.triage = { version, commit: checkout.commit, exact: checkout.exact, repository: triageRepository() };
		workspaceRuntime.store.saveProject(project);
		return { projectId: project.id };
	}).finally(() => { triagePreparing = undefined; });
	const { projectId } = await triagePreparing;
	const workspace = workspaceRuntime.store.getOverview(); workspaceRuntime.onChange(workspace);
	const triage = workspaceRuntime.store.getProjects().find(project => project.id === projectId)!.triage!;
	return { workspace, projectId, build: triageBuild(), triage, playbook: triagePlaybookName() };
});
ipcMain.handle("workspace:triage-playbook", async (event, projectId: unknown, playbook: unknown, options: unknown) => {
	if (!senderWindow(event) || shutdownStarted || typeof projectId !== "string" || typeof playbook !== "string") throw new Error("Invalid triage request.");
	const project = workspaceRuntime.store.getProjects().find(value => value.id === projectId);
	if (!project?.triage) throw new Error("This project is not a triage checkout.");
	const offerPullRequest = Boolean(options && typeof options === "object" && (options as { offerPullRequest?: unknown }).offerPullRequest === true);
	const logsDirectory = path.join(app.getPath("userData"), "logs");
	const diagnostics = await readTraceDiagnostics({ traceFilePath: path.join(logsDirectory, "traces.ndjson"), logsDirectory, maxFiles: 3 }).catch(() => undefined);
	await writeTriagePlaybook(project.directory, playbook, triagePlaybook({ build: triageBuild(), triage: project.triage, checkout: project.directory, userData: app.getPath("userData"), diagnostics: diagnosticsSection(diagnostics, homedir()), offerPullRequest }));
});
ipcMain.handle("workspace:issue-draft", async (event, taskId: unknown, action: unknown, edit: unknown) => {
	if (!senderWindow(event) || shutdownStarted || typeof taskId !== "string" || (action !== "file" && action !== "discard")) throw new Error("Invalid issue draft request.");
	await span("triage.issue", { action }, () => workspaceRuntime.issueDraftAction(taskId, action, edit));
});
ipcMain.handle("workspace:project-file", (event, id: unknown) => {
	if (!senderWindow(event) || typeof id !== "string" || !id || id.length > 200) throw new Error("Invalid project request.");
	const project = workspaceRuntime.store.getProjects().find(value => value.id === id);
	return project && !project.worktree?.removedAt ? readT3ProjectFile(project.directory) : { status: "missing", scripts: [] };
});
ipcMain.handle("workspace:update-project", (event, value: unknown) => {
	if (!senderWindow(event) || shutdownStarted) throw new Error("Invalid project request.");
	return workspaceRuntime.updateProject(validateProjectUpdate(value));
});
ipcMain.handle("workspace:paste-image", async (event, id: unknown, name: unknown, data: unknown) => {
	if (!senderWindow(event) || typeof id !== "string" || typeof name !== "string" || name.length > 200 || !(data instanceof Uint8Array) || data.byteLength > 10 * 1024 * 1024 || shutdownStarted) throw new Error("Invalid pasted image.");
	if (workspaceRuntime.store.getTask(id).archived) throw new Error("Restore this chat before attaching images.");
	const bytes = Buffer.from(data); if (!imageMime(bytes)) throw new Error("Paste a PNG, JPEG, GIF or WebP image.");
	const attachment = await workspaceRuntime.attachments.prepare(id, name || "Pasted image.png", bytes);
	try { if (shutdownStarted || workspaceRuntime.store.getTask(id).archived) throw new Error("This chat is unavailable."); workspaceRuntime.store.saveAttachment(attachment); return attachment; }
	catch (error) { await workspaceRuntime.attachments.discard(attachment); throw error; }
});
ipcMain.handle("workspace:paste-file", async (event, id: unknown, name: unknown, data: unknown) => {
	if (!senderWindow(event) || typeof id !== "string" || typeof name !== "string" || !name.trim() || name.length > 200 || !(data instanceof Uint8Array) || data.byteLength > 10 * 1024 * 1024 || shutdownStarted) throw new Error("Invalid file.");
	if (workspaceRuntime.store.getTask(id).archived) throw new Error("Restore this chat before adding files.");
	// prepare accepts what Attach files does: images, PDFs and UTF-8 text.
	const attachment = await workspaceRuntime.attachments.prepare(id, name, Buffer.from(data));
	try { if (shutdownStarted || workspaceRuntime.store.getTask(id).archived) throw new Error("This chat is unavailable."); workspaceRuntime.store.saveAttachment(attachment); return attachment; }
	catch (error) { await workspaceRuntime.attachments.discard(attachment); throw error; }
});
ipcMain.handle("workspace:choose-attachments", async (event, id: unknown) => {
	const window = senderWindow(event); if (!window || typeof id !== "string") throw new Error("Invalid attachment request.");
	if (workspaceRuntime.store.getTask(id).archived) throw new Error("Restore this task before adding files.");
	const result = await dialog.showOpenDialog(window, { properties: ["openFile", "multiSelections"], title: "Attach files", filters: [{ name: "Images, media and documents", extensions: ["pdf", "png", "jpg", "jpeg", "gif", "webp", "mp3", "m4a", "wav", "ogg", "opus", "flac", "aac", "mp4", "mov", "webm", "txt", "md", "csv", "json", "ts", "py"] }, { name: "All files", extensions: ["*"] }] });
	if (result.canceled) return { attachments: [], errors: [] };
	if (result.filePaths.length > 10) throw new Error("Choose up to 10 attachments.");
	if (shutdownStarted) throw new Error("The workspace is shutting down.");
	const imported = await Promise.allSettled(result.filePaths.map(filename => workspaceRuntime.attachments.import(id, filename)));
	return { attachments: imported.flatMap(value => value.status === "fulfilled" ? [value.value] : []), errors: imported.flatMap(value => value.status === "rejected" ? [value.reason instanceof Error ? value.reason.message : "Attachment import failed."] : []) };
});
ipcMain.handle("workspace:mcp-prompt-attachments", async (event, id: unknown, messages: unknown) => {
 if (!senderWindow(event) || typeof id !== "string") throw Error("Invalid prompt attachment request.");
 if (shutdownStarted || workspaceRuntime.store.getTask(id).archived) throw Error("This chat is unavailable for prompt insertion.");
 return importMcpPromptAttachments(id, messages, workspaceRuntime.attachments, attachments => {
  if (shutdownStarted || workspaceRuntime.store.getTask(id).archived) throw Error("This chat is unavailable for prompt insertion.");
  workspaceRuntime.store.saveAttachments(attachments);
 });
});
ipcMain.handle("workspace:attachment", async (event, taskId: unknown, id: unknown) => {
	if (!senderWindow(event) || typeof taskId !== "string" || typeof id !== "string") throw new Error("Invalid attachment request.");
	const task = workspaceRuntime.store.getTask(taskId); const attachment = workspaceRuntime.store.getAttachment(id);
	if (!attachment || (attachment.taskId !== task.id && ![...task.messages, ...task.queue].some(message => message.attachments?.some(value => value.id === id)))) throw new Error("Attachment is unavailable for this task.");
	const content = await workspaceRuntime.attachments.read(id);
	return { attachment, text: content.text, dataUrl: content.dataUrl };
});
ipcMain.handle("workspace:save-attachment", async (event, taskId: unknown, id: unknown) => {
	const window = senderWindow(event); if (!window || typeof taskId !== "string" || typeof id !== "string") throw new Error("Invalid attachment request.");
	const task = workspaceRuntime.store.getTask(taskId); const attachment = workspaceRuntime.store.getAttachment(id);
	if (!attachment || (attachment.taskId !== task.id && ![...task.messages, ...task.queue].some(message => message.attachments?.some(value => value.id === id)))) throw new Error("Attachment is unavailable for this task.");
	const content = await workspaceRuntime.attachments.read(id);
	const result = await dialog.showSaveDialog(window, { title: "Save attachment", defaultPath: path.join(app.getPath("downloads"), attachment.name) });
	if (result.canceled || !result.filePath) return false;
	await copyFile(content.filePath, result.filePath);
	return true;
});
function harnessInstallations() {
	return Promise.all((["codex", "claude", "opencode", "pi", "cursor", "grok"] as const).map(async harness => {
		try {
			if (harness === "cursor") return { harness, installed: true, version: "SDK 1.0.31" };
			if (harness === "grok") return { harness, installed: true, version: await harnessVersion(await resolveGrokCommand(), app.getPath("userData")) };
			if (harness === "opencode") { const command = await resolveOpenCodeCommand(app.getPath("userData")); return { harness, installed: true, version: command.version }; }
			const command = await resolveNativeCommand(harness, harness === "codex" ? "@openai/codex/bin/codex.js" : harness === "pi" ? piEntries : undefined);
			const version = await harnessVersion(command, app.getPath("userData"));
			const maintenance = await resolveHarnessMaintenance(harness, command);
			return { harness, installed: true, version, maintenance: { method: maintenance.method, canUpdate: Boolean(maintenance.action) } };
		} catch (error) { return { harness, installed: false, error: error instanceof Error ? error.message : "Installation is unavailable." }; }
	}));
}
ipcMain.handle("workspace:installations", async event => {
	if (!senderWindow(event)) throw new Error("Untrusted workspace request.");
	return harnessInstallations();
});

ipcMain.handle("workspace:update-harness", async (event, harness: unknown) => {
	if (!senderWindow(event) || (harness !== "codex" && harness !== "claude" && harness !== "pi")) throw new Error("Invalid harness update request.");
	if (shutdownStarted) throw new Error("The workspace is shutting down.");
	if (harnessUpdate) throw new Error("A harness update is already in progress.");
	if (modelChecks.has(harness)) throw new Error("Finish this harness's catalog check before updating it.");
	const accounts = workspaceRuntime.store.getAccounts();
	if ([...accountChecks.keys()].some(key => key === harness || accounts.some(account => account.id === key && account.harness === harness))) throw new Error("Finish this harness's account check before updating it.");
	const release = workspaceRuntime.beginHarnessMaintenance(harness), controller = new AbortController();
	const completed = (async () => {
		const command = await resolveNativeCommand(harness, harness === "codex" ? "@openai/codex/bin/codex.js" : harness === "pi" ? piEntries : undefined);
		await harnessVersion(command, app.getPath("userData"));
		const maintenance = await resolveHarnessMaintenance(harness, command);
		if (!maintenance.action) throw new Error("Use this harness's installer to update it.");
		await runHarnessUpdate(maintenance.action, app.getPath("userData"), controller.signal);
		const refreshed = await resolveNativeCommand(harness, harness === "codex" ? "@openai/codex/bin/codex.js" : harness === "pi" ? piEntries : undefined);
		await harnessVersion(refreshed, app.getPath("userData"));
	})();
	harnessUpdate = { harness, controller, completed };
	try { await completed; } finally { harnessUpdate = undefined; release(); }
});
ipcMain.handle("workspace:cancel-harness-update", event => {
	if (!senderWindow(event)) throw new Error("Invalid harness update request.");
	harnessUpdate?.controller.abort();
});
ipcMain.handle("workspace:harness-update-status", event => {
	if (!senderWindow(event)) throw new Error("Invalid harness update request.");
	return harnessUpdate?.harness;
});

function getWindowState(window: BrowserWindow) {
	return {
		isFocused: window.isFocused(),
		isFullScreen: window.isFullScreen(),
		isMaximized: window.isMaximized(),
	};
}

function broadcastWindowState(window: BrowserWindow) {
	window.webContents.send("desktop:window-state", getWindowState(window));
}

function broadcastUpdateState(state: DesktopUpdateState) {
	for (const window of BrowserWindow.getAllWindows()) window.webContents.send("desktop:update-state", state);
}

/** The app's own windows, not the separate windows browser tabs pop out into. */
const appWindows = new Set<BrowserWindow>();
function createWindow(): BrowserWindow {
	const window = new BrowserWindow({
		width: 1440,
		height: 920,
		minWidth: 1040,
		minHeight: 680,
		show: false,
		backgroundColor: "#101112",
		icon: applicationIcon,
		title: "Phaseo",
		frame: process.platform === "darwin",
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
		trafficLightPosition: process.platform === "darwin" ? { x: 14, y: 13 } : undefined,
		webPreferences: {
			preload: preloadPath,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			webSecurity: true,
		},
	});

	if (process.platform === "win32" && "setBackgroundMaterial" in window) {
		window.setBackgroundMaterial("mica");
	}

	appWindows.add(window); window.once("closed", () => appWindows.delete(window));
	window.once("ready-to-show", () => window.show());
	window.on("blur", () => broadcastWindowState(window));
	window.on("focus", () => broadcastWindowState(window));
	window.on("maximize", () => broadcastWindowState(window));
	window.on("unmaximize", () => broadcastWindowState(window));
	window.on("enter-full-screen", () => broadcastWindowState(window));
	window.on("leave-full-screen", () => broadcastWindowState(window));
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (isAllowedExternalUrl(url)) void shell.openExternal(url);
		return { action: "deny" };
	});
	window.webContents.on("will-navigate", (event, url) => {
		const currentUrl = window.webContents.getURL();
		if (url !== currentUrl) event.preventDefault();
	});

	if (developmentUrl) {
		void window.loadURL(developmentUrl);
	} else {
		void window.loadFile(rendererPath);
	}

	return window;
}

function senderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
	if (event.senderFrame !== event.sender.mainFrame) return null;
	const owner = BrowserWindow.fromWebContents(event.sender);
	return owner?.webContents === event.sender ? owner : null;
}

const browserHost = new BrowserHost();
registerFactoryIpc(ipcMain, () => factoryService, senderWindow, async window => { const picked = await dialog.showOpenDialog(window, { title: "Choose a local clone of the repository", properties: ["openDirectory"] }); return picked.canceled ? undefined : picked.filePaths[0]; });
const browserAgent = new BrowserAgent(browserHost, () => [...appWindows].find(window => !window.isDestroyed()));
let browserRecordings: BrowserRecordings;
ipcMain.handle("desktop:browser", (event, command: unknown) => { const owner = senderWindow(event); if (!owner) throw new Error("Untrusted browser request."); return browserHost.command(owner, command); });
ipcMain.handle("desktop:browser-capture", (event, id: unknown) => { const owner = senderWindow(event); if (!owner) throw new Error("Untrusted browser request."); return browserHost.capture(owner, browserId(id)); });
ipcMain.handle("desktop:browser-pick", (event, id: unknown, cancel: unknown) => { const owner = senderWindow(event); if (!owner || typeof cancel !== "boolean") throw new Error("Untrusted browser request."); return browserHost.pick(owner, browserId(id), cancel); });
ipcMain.handle("desktop:browser-recording-source", (event, id: unknown) => { const owner = senderWindow(event); if (!owner) throw new Error("Untrusted browser request."); return browserHost.mediaSource(owner, browserId(id)); });
ipcMain.handle("desktop:browser-recording-save", (event, mimeType: unknown, data: unknown) => { if (!senderWindow(event)) throw new Error("Untrusted browser request."); return browserRecordings.save(mimeType, data); });
ipcMain.handle("desktop:browser-recording-reveal", async (event, file: unknown) => { if (!senderWindow(event)) throw new Error("Untrusted browser request."); shell.showItemInFolder(await browserRecordings.resolve(file)); });
ipcMain.handle("desktop:browser-local-servers", event => { if (!senderWindow(event)) throw new Error("Untrusted browser request."); return localServers(); });
ipcMain.handle("desktop:browser-probe", (event, url: unknown) => { if (!senderWindow(event)) throw new Error("Untrusted browser request."); return probeAddress(probeUrl(url)); });
ipcMain.handle("desktop:browser-download", (event, command: unknown) => { const owner = senderWindow(event); if (!owner) throw new Error("Untrusted download request."); return browserHost.downloads.command(owner, command); });

ipcMain.handle("desktop:get-runtime-info", (event) => senderWindow(event) ? ({
		platform: process.platform,
		version: app.getVersion(),
		isPackaged: app.isPackaged,
	}) : null);

ipcMain.handle("desktop:get-window-state", (event) => {
	const window = senderWindow(event);
	return window ? getWindowState(window) : { isFocused: true, isFullScreen: false, isMaximized: false };
});

ipcMain.handle("desktop:window-action", (event, action: DesktopWindowAction) => {
	const window = senderWindow(event);
	if (!window) return;
	if (action === "close") window.close();
	else if (action === "minimize") window.minimize();
	else if (action === "toggle-maximize") {
		if (window.isMaximized()) window.unmaximize();
		else window.maximize();
	}
});

const keybindings = new KeybindingsFile(path.join(app.getPath("userData"), "settings", "keybindings.json"));
keybindings.onChange = state => { browserHost.shortcutKeys = browserShortcuts(state.entries); for (const window of BrowserWindow.getAllWindows()) window.webContents.send("desktop:keybindings-changed", state); };
browserHost.shortcutKeys = browserShortcuts(keybindings.read().entries);
keybindings.watch();
ipcMain.handle("desktop:keybindings", event => { if (!senderWindow(event)) throw new Error("Invalid keybindings request."); return keybindings.read(); });
ipcMain.handle("desktop:save-keybindings", (event, value: unknown) => { if (!senderWindow(event)) throw new Error("Invalid keybindings request."); const state = keybindings.save(value); keybindings.onChange(state); return state; });
ipcMain.handle("desktop:open-keybindings", async event => { if (!senderWindow(event)) throw new Error("Invalid keybindings request."); const problem = await shell.openPath(keybindings.ensure()); if (problem) throw new Error(problem); });

ipcMain.handle("desktop:app-action", (event, action: DesktopAppAction) => {
	const window = senderWindow(event);
	if (!window) return;
	const contents = window.webContents;
	const actions: Partial<Record<DesktopAppAction, () => void>> = {
		copy: () => contents.copy(), cut: () => contents.cut(), paste: () => contents.paste(),
		"select-all": () => contents.selectAll(), reload: () => contents.reload(),
		"toggle-full-screen": () => window.setFullScreen(!window.isFullScreen()),
		"zoom-in": () => contents.setZoomLevel(contents.getZoomLevel() + 0.5),
		"zoom-out": () => contents.setZoomLevel(contents.getZoomLevel() - 0.5),
		"zoom-reset": () => contents.setZoomLevel(0), quit: () => app.quit(),
	};
	actions[action]?.();
});

ipcMain.handle("desktop:check-for-updates", async (event): Promise<DesktopUpdateState> => {
	if (!senderWindow(event)) return { status: "error", message: "Untrusted update request." };
	if (!app.isPackaged || !updateFeedUrl) return { status: "unsupported", message: "Updates are configured in release builds." };
	broadcastUpdateState({ status: "checking" });
	try {
		autoUpdater.setFeedURL({ url: updateFeedUrl });
		await autoUpdater.checkForUpdates();
		return { status: "checking" };
	} catch (error) {
		const state = { status: "error", message: error instanceof Error ? error.message : "Update check failed." } as const;
		broadcastUpdateState(state);
		return state;
	}
});

ipcMain.handle("desktop:install-update", (event) => {
	if (senderWindow(event)) autoUpdater.quitAndInstall();
});

// The dock (macOS) and launcher (Linux) count it; Windows has no count, so the taskbar button shows an overlay instead.
ipcMain.handle("desktop:set-badge", (event, count: unknown, overlay: unknown) => {
	const window = senderWindow(event);
	if (!window || !Number.isSafeInteger(count) || (count as number) < 0 || (count as number) > 100_000) return;
	app.setBadgeCount(count as number);
	if (process.platform !== "win32") return;
	const image = count && typeof overlay === "string" && overlay.length < 50_000 && overlay.startsWith("data:image/png;base64,") ? nativeImage.createFromDataURL(overlay) : null;
	window.setOverlayIcon(image && !image.isEmpty() ? image : null, image ? `${count} unread` : "");
});
ipcMain.handle("desktop:open-external", async (event, url: unknown) => {
	if (!senderWindow(event) || typeof url !== "string" || !isAllowedExternalUrl(url)) return false;
	await shell.openExternal(url);
	return true;
});

app.setAppUserModelId(developmentUrl ? "app.phaseo.desktop.dev" : "app.phaseo.desktop");
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on("second-instance", () => {
	const window = BrowserWindow.getAllWindows()[0];
	if (window?.isMinimized()) window.restore(); window?.show(); window?.focus();
});

autoUpdater.on("update-available", () => broadcastUpdateState({ status: "available" }));
autoUpdater.on("update-not-available", () => broadcastUpdateState({ status: "unavailable" }));
autoUpdater.on("update-downloaded", (_event, notes, name) => {
	void notes;
	broadcastUpdateState({ status: "ready", version: name });
});
autoUpdater.on("error", (error) => broadcastUpdateState({ status: "error", message: error.message }));

app.whenReady().then(() => {
	if (!primaryInstance) return;
	if (process.platform === "darwin") app.dock?.setIcon(applicationIcon);
	const workspaceDirectory = path.join(app.getPath("userData"), "workspace");
	const vault = new SecretVault(path.join(workspaceDirectory, "credentials"), windowsCredentialEncryption({
		available: async () => await safeStorage.isAsyncEncryptionAvailable() && (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text"),
		encrypt: value => safeStorage.encryptStringAsync(value), decrypt: async value => (await safeStorage.decryptStringAsync(value)).result,
	}));
	credentialVault = vault;
	usageHubs = new UsageHubs(usageHubFile(workspaceDirectory), { set: (id, value) => vault.set(id, value), get: id => vault.get(id), remove: id => vault.remove(id) });
	modelCatalogCache = new ModelCatalogCache(path.join(app.getPath("userData"), "cache"), ({ accountId }) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send("workspace:models-changed", { harness: "phaseo", accountId }); });
	harnessModelCache = new HarnessModelCache(path.join(app.getPath("userData"), "cache", "harness-models.json"), (harness, accountId) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send("workspace:models-changed", { harness, accountId }); });
	workspaceRuntime = new WorkspaceRuntime(workspaceDirectory, undefined, vault);
	workspaceRuntime.phaseo.background = backgroundCommands();
	// Rows are written by a worker on its own connection, so a first read doesn't hold up the app.
	transcriptScanner = new TranscriptScanner(workspaceRuntime.store, () => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send("workspace:usage-changed"); }, { writer: () => new TranscriptWriter(workspaceRuntime.store.filename) });
	// After the ledger's own start-up work, so a first read of large transcripts doesn't compete with opening the app.
	setTimeout(() => { if (!shutdownStarted) void transcriptScanner?.scan(true).catch(() => {}); }, 5000).unref?.();
	// Phaseo turns size compaction and output limits from the cached catalogue; a model not in it gets safe defaults.
	workspaceRuntime.phaseo.facts = async (account, model) => account.endpoint ? (await modelCatalogCache.read({ endpoint: account.endpoint, accountId: account.id }))?.models.find(value => value.id === model)?.facts : undefined;
	pullRequestGuides = new PullRequestGuides(path.join(workspaceDirectory, "pull-request-guides"), input => workspaceRuntime.completeWithTitleModel(input), async (root, view) => {
		try { return await runGh(root, ["pr", "diff", String(view.number), "--repo", `github.com/${view.repository}`, "--color", "never"]); }
		catch (reason) { throw new Error(ghFailure((reason as { stderr?: unknown }).stderr, "Could not read the pull request's diff."), { cause: reason }); }
	});
	pullRequestGuides.onFinished = ({ root, view, error }) => {
		if (shutdownStarted) return;
		const projectId = workspaceRuntime.store.getProjects().find(project => path.resolve(project.directory).toLowerCase() === path.resolve(root).toLowerCase())?.id;
		const event = { ...(projectId ? { projectId } : {}), repository: view.repository, number: view.number, title: view.title, ...(error ? { error } : {}) };
		for (const window of BrowserWindow.getAllWindows()) window.webContents.send("workspace:pull-request-guide-finished", event);
		taskNotifications.guide(Boolean(error), view.number, view.repository, view.title, () => {
			const window = BrowserWindow.getAllWindows().find(value => !value.isDestroyed());
			if (!window) return;
			if (window.isMinimized()) window.restore();
			window.show(); window.focus(); window.webContents.send("workspace:open-pull-request-guide", event);
		});
	};
	workspaceRuntime.pullRequestGuideTools = {
		write: async (root, repository, number) => { const view = await readPullRequestView(root, repository, number), before = await pullRequestGuides.get(view); void pullRequestGuides.generate(root, view); return before.running ? "running" : "started"; },
		read: async (root, repository, number) => pullRequestGuides.get(await readPullRequestView(root, repository, number)),
	};
	workspaceRuntime.discoverThreadModels = discoverDesktopModels;
	workspaceRuntime.discoverInstallations = harnessInstallations;
	factoryService = new FactoryService(workspaceRuntime, { dataDir: factoryDataFolder(workspaceDirectory), legacyFolder: legacyFactoryFolder(app.getPath("appData")), demo: process.env.PHASEO_FACTORY_DEMO === "1", broadcast: factoryBroadcaster(() => BrowserWindow.getAllWindows()) });
	workspaceRuntime.factoryTools = threadId => factoryService!.agentTools(threadId);
	void factoryService.start().catch(() => {});
	globalInstructions = new GlobalInstructions(path.join(workspaceDirectory, "instructions"));
	browserHost.downloads.configure(workspaceRuntime.store.browserDownloads);
	taskNotifications = new TaskNotifications({
		focused: () => Boolean(BrowserWindow.getFocusedWindow()), supported: () => Notification.isSupported(),
		show: (title, body, click) => { const notification = new Notification({ title, body, silent: true }); notification.on("click", click); notification.on("failed", () => {}); notification.show(); return () => { notification.removeAllListeners(); notification.close(); }; },
		open: taskId => { if (shutdownStarted) return; const window = BrowserWindow.getAllWindows().find(value => !value.isDestroyed()) ?? createWindow(); if (window.isMinimized()) window.restore(); window.show(); window.focus(); const id = taskId && workspaceRuntime.store.getOverview().tasks.some(value => value.id === taskId) ? taskId : undefined; const navigate = () => { if (!window.isDestroyed()) window.webContents.send("workspace:open-task", id); }; if (window.webContents.isLoading()) window.webContents.once("did-finish-load", navigate); else navigate(); },
	}, workspaceRuntime.store.getPreferences());
	taskNotifications.update(workspaceRuntime.store.getOverview());
	app.on("browser-window-focus", () => taskNotifications.dismiss());
	missionService = new MissionService(workspaceRuntime);
	missionService.onChange = () => { const missions = workspaceRuntime.store.missions.list(); for (const window of BrowserWindow.getAllWindows()) window.webContents.send("workspace:missions-changed", missions); };
	workspaceRuntime.onAutopilotLog = () => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send("workspace:autopilot-log-changed"); };
	terminalService = new TerminalService(workspaceRuntime.store, path.join(workspaceDirectory, "terminals"));
	workspaceRuntime.onTerminalAuth = (request, signal) => terminalService.authenticate(request, signal);
	workspaceRuntime.getTerminals = () => terminalService.get();
	workspaceRuntime.closeIdleTerminals = taskId => terminalService.closeIdle(taskId);
	workspaceRuntime.runProjectScript = (projectId, script) => { terminalService.runScript(projectId, script); };
	workspaceRuntime.runSetupScript = (projectId, script, taskId) => terminalService.runSetup(projectId, script, taskId);
	// Usage-limit recovery reads the reset time from the same limits Settings → Usage shows, unless a check is running.
	workspaceRuntime.usageLimitReset = async (harness, accountId) => {
		const account = accountId ? workspaceRuntime.store.getAccounts().find(value => value.id === accountId && value.harness === harness && value.kind === "native") : undefined;
		if (accountChecks.has(accountId ?? harness) || shutdownStarted) return undefined;
		return limitResetAt(await nativeAccountStatus(harness, account?.configDirectory ?? app.getPath("userData"), account, AbortSignal.timeout(30000)));
	};
	workspaceRuntime.browserTools = chatId => browserAgent.forChat(chatId);
	browserRecordings = new BrowserRecordings(path.join(app.getPath("userData"), "browser-recordings"));
	terminalService.onEvent = event => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send("workspace:terminal-event", event); };
	workspaceRuntime.onChange = state => {
		missionService.observe(state);
		taskNotifications.update(state);
		const overview = state;
		for (const window of BrowserWindow.getAllWindows()) window.webContents.send("workspace:overview-changed", overview);
	};
	if (process.platform !== "darwin") Menu.setApplicationMenu(null);
	createWindow();
	missionService.start();
	void refreshPhaseoSignIns();
	phaseoSignInTimer = setInterval(() => void refreshPhaseoSignIns(), 6 * 3_600_000); phaseoSignInTimer.unref();
	workspaceRuntime.settleIdleThreads();
	settleTimer = setInterval(() => workspaceRuntime.settleIdleThreads(), 60_000); settleTimer.unref();
	// Worktree cleanup waits for startup to settle, then runs every six hours.
	setTimeout(autoCleanWorktrees, 120_000).unref(); worktreeCleanupTimer = setInterval(autoCleanWorktrees, 6 * 3_600_000); worktreeCleanupTimer.unref();
	workspaceRuntime.onPullRequestNotice = (taskId, summary, outcome) => { const title = workspaceRuntime.store.getOverview().tasks.find(task => task.id === taskId)?.title ?? "Chat"; taskNotifications.notice(taskId, title, summary, outcome !== "completed"); };
	pullRequestWatcher = new PullRequestWatcher({ targets: () => workspaceRuntime.pullRequestWatchTargets(), read: readPullRequestView, record: (taskId, link, startedAt, next, update) => workspaceRuntime.recordPullRequestWatch(taskId, link, startedAt, next, update), snapshot: view => workspaceRuntime.syncPullRequestSnapshot(view.repository, view.number, pullRequestLinkSnapshot(view)) });
	pullRequestWatcher.start();
	workspaceRuntime.onIssueNotice = (taskId, summary, outcome) => { const title = workspaceRuntime.store.getOverview().tasks.find(task => task.id === taskId)?.title ?? "Chat"; taskNotifications.notice(taskId, title, summary, outcome === "failed"); };
	issueWatcher = new IssueWatcher({ targets: () => workspaceRuntime.issueWatchTargets(), read: (cwd, repository, number) => workspaceRuntime.github.readIssue(cwd, repository, number), record: (taskId, link, startedAt, next, update) => workspaceRuntime.recordIssueWatch(taskId, link, startedAt, next, update), snapshot: issue => workspaceRuntime.syncIssueSnapshot(issue.repository, issue.number, issueLinkSnapshot(issue)) });
	issueWatcher.start();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
