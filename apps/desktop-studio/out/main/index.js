import { dialog, app, BrowserWindow, ipcMain, Menu } from "electron";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { join, dirname, resolve, relative, normalize } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { nanoid } from "nanoid";
import { tmpdir } from "node:os";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const DESKTOP_IDENTITY_HEADERS$1 = {
  "x-title": "AI Stats Desktop",
  "http-referer": "https://ai-stats.phaseo.app/desktop",
  "x-ai-stats-client": "desktop-studio"
};
function extractOpenAiText(payload) {
  const firstChoice = payload?.choices?.[0];
  const content = firstChoice?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      if (entry?.type === "text" && typeof entry.text === "string") {
        return entry.text;
      }
      return "";
    }).join("");
  }
  return "";
}
function toOpenAiMessages(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
}
async function generateFromOpenAiCompatible(provider, model, messages) {
  const baseUrl = (provider.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const headers = {
    "Content-Type": "application/json",
    ...DESKTOP_IDENTITY_HEADERS$1
  };
  if (provider.apiKey.trim()) {
    const key = provider.apiKey.trim();
    headers.Authorization = `Bearer ${key}`;
  }
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: toOpenAiMessages(messages),
      stream: false
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Provider error ${response.status}: ${text.slice(0, 300)}`);
  }
  const payload = await response.json();
  const content = extractOpenAiText(payload);
  return {
    model: payload?.model ?? model,
    content: content || "The provider returned an empty response."
  };
}
function generateMockResponse(provider, model, messages) {
  const prompt = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  return {
    model,
    content: [
      `Mock assistant response from ${provider.name}.`,
      "",
      "To connect a real model, use an OpenAI-compatible provider profile.",
      "",
      `Your latest prompt was:
${prompt.slice(0, 800)}`
    ].join("\n")
  };
}
async function generateAssistantReply(provider, model, messages) {
  if (provider.kind === "openai-compatible") {
    return generateFromOpenAiCompatible(provider, model, messages);
  }
  return generateMockResponse(provider, model, messages);
}
const BLOCKED_PATTERNS = [
  /(^|\s)rm\s+-rf(\s|$)/i,
  /(^|\s)del\s+\/s(\s|$)/i,
  /(^|\s)shutdown(\s|$)/i,
  /(^|\s)reboot(\s|$)/i,
  /(^|\s)format(\s|$)/i,
  /git\s+reset\s+--hard/i,
  /(^|\s)mkfs(\s|$)/i,
  /(^|\s)diskpart(\s|$)/i
];
function nowIso$1() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function validateCommand(command) {
  const normalized = command.trim();
  if (!normalized) {
    throw new Error("Command cannot be empty.");
  }
  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw new Error("Command blocked by safety policy.");
  }
}
class CommandRunner {
  runs = /* @__PURE__ */ new Map();
  run(request, onOutput, onDone) {
    validateCommand(request.command);
    const run = {
      id: nanoid(),
      command: request.command,
      workspacePath: request.workspacePath,
      startedAt: nowIso$1()
    };
    const child = process.platform === "win32" ? spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-Command", request.command], {
      cwd: request.workspacePath,
      env: process.env
    }) : spawn("/bin/bash", ["-lc", request.command], {
      cwd: request.workspacePath,
      env: process.env
    });
    this.runs.set(run.id, child);
    child.stdout.on("data", (buffer) => {
      onOutput({
        runId: run.id,
        stream: "stdout",
        chunk: buffer.toString("utf8"),
        at: nowIso$1()
      });
    });
    child.stderr.on("data", (buffer) => {
      onOutput({
        runId: run.id,
        stream: "stderr",
        chunk: buffer.toString("utf8"),
        at: nowIso$1()
      });
    });
    child.on("close", (code) => {
      this.runs.delete(run.id);
      onDone({
        ...run,
        exitCode: code ?? 0,
        finishedAt: nowIso$1()
      });
    });
    child.on("error", (error) => {
      this.runs.delete(run.id);
      onOutput({
        runId: run.id,
        stream: "stderr",
        chunk: `${error.message}
`,
        at: nowIso$1()
      });
      onDone({
        ...run,
        exitCode: 1,
        finishedAt: nowIso$1()
      });
    });
    return run;
  }
  stop(runId) {
    const proc = this.runs.get(runId);
    if (!proc) {
      return;
    }
    if (process.platform === "win32") {
      proc.kill();
    } else {
      proc.kill("SIGTERM");
    }
    this.runs.delete(runId);
  }
}
function runGit(workspacePath, args) {
  return spawnSync("git", args, {
    cwd: workspacePath,
    encoding: "utf8"
  });
}
function isGitRepository(workspacePath) {
  const result = runGit(workspacePath, ["rev-parse", "--is-inside-work-tree"]);
  return result.status === 0 && result.stdout.trim() === "true";
}
function parseGitStatusPorcelain(output) {
  return output.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.length >= 3).map((line) => {
    const indexStatus = line[0] ?? " ";
    const workTreeStatus = line[1] ?? " ";
    const payload = line.slice(3).trim();
    if (payload.includes(" -> ")) {
      const [originalPath, path] = payload.split(" -> ");
      return {
        path: path ?? payload,
        originalPath,
        indexStatus,
        workTreeStatus
      };
    }
    return {
      path: payload,
      indexStatus,
      workTreeStatus
    };
  }).sort((a, b) => a.path.localeCompare(b.path));
}
function listGitStatus(workspacePath) {
  if (!isGitRepository(workspacePath)) {
    return [];
  }
  const result = runGit(workspacePath, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || "Unable to read git status.").trim();
    throw new Error(details);
  }
  return parseGitStatusPorcelain(result.stdout);
}
function getGitDiff(workspacePath, relativePath) {
  if (!isGitRepository(workspacePath)) {
    return "";
  }
  const args = ["diff", "--no-color", "HEAD"];
  if (relativePath && relativePath.trim()) {
    args.push("--", relativePath);
  }
  const result = runGit(workspacePath, args);
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || "Unable to read git diff.").trim();
    throw new Error(details);
  }
  return result.stdout;
}
function applyGitPatch(workspacePath, patch) {
  if (!isGitRepository(workspacePath)) {
    return {
      applied: false,
      output: "Not a git repository."
    };
  }
  if (!patch.trim()) {
    return {
      applied: false,
      output: "Patch content is empty."
    };
  }
  const patchTempDir = mkdtempSync(join(tmpdir(), "desktop-studio-patch-"));
  const patchFile = join(patchTempDir, "change.patch");
  try {
    writeFileSync(patchFile, patch, "utf8");
    const result = runGit(workspacePath, ["apply", "--whitespace=nowarn", patchFile]);
    if (result.status !== 0) {
      return {
        applied: false,
        output: (result.stderr || result.stdout || "Patch failed to apply.").trim()
      };
    }
    return {
      applied: true,
      output: "Patch applied successfully."
    };
  } finally {
    rmSync(patchTempDir, { recursive: true, force: true });
  }
}
const DESKTOP_IDENTITY_HEADERS = {
  "x-title": "AI Stats Desktop",
  "http-referer": "https://ai-stats.phaseo.app/desktop",
  "x-ai-stats-client": "desktop-studio"
};
function uniqueNonEmpty$1(values) {
  const seen = /* @__PURE__ */ new Set();
  const output = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    output.push(trimmed);
  }
  return output;
}
function extractModelId(entry) {
  if (typeof entry === "string") {
    return entry;
  }
  if (!entry || typeof entry !== "object") {
    return "";
  }
  const item = entry;
  const value = item.id ?? item.model ?? item.name ?? item.model_id ?? item.modelId ?? item.internal_model_id ?? item.internalModelId;
  return typeof value === "string" ? value : "";
}
function extractModels(payload) {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const objectPayload = payload;
  const candidateArrays = [
    objectPayload.data,
    objectPayload.models,
    objectPayload.result?.data,
    objectPayload.result?.models
  ];
  for (const candidate of candidateArrays) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    const models = uniqueNonEmpty$1(candidate.map(extractModelId));
    if (models.length > 0) {
      return models.sort((a, b) => a.localeCompare(b));
    }
  }
  return [];
}
async function fetchProviderModels(provider) {
  if (provider.kind !== "openai-compatible") {
    return uniqueNonEmpty$1(provider.models);
  }
  const baseUrl = (provider.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const headers = {
    ...DESKTOP_IDENTITY_HEADERS
  };
  if (provider.apiKey.trim()) {
    headers.Authorization = `Bearer ${provider.apiKey.trim()}`;
  }
  const response = await fetch(`${baseUrl}/models`, {
    method: "GET",
    headers
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway model sync failed (${response.status}): ${text.slice(0, 240)}`);
  }
  const payload = await response.json();
  const models = extractModels(payload);
  if (models.length === 0) {
    throw new Error("Gateway returned no models from /models.");
  }
  return models;
}
const STORE_FILENAME = "studio-store-v1.json";
const DEFAULT_GATEWAY_PROVIDER = {
  id: "provider-ai-stats-gateway",
  name: "AI Stats Gateway",
  kind: "openai-compatible",
  baseUrl: "https://api.phaseo.app/v1",
  apiKey: "",
  models: ["gpt-5-mini", "gpt-5"],
  defaultModel: "gpt-5-mini"
};
const DEFAULT_SETTINGS = {
  providers: [DEFAULT_GATEWAY_PROVIDER],
  chatSelection: {
    providerId: DEFAULT_GATEWAY_PROVIDER.id,
    model: DEFAULT_GATEWAY_PROVIDER.defaultModel
  },
  codeSelection: {
    providerId: DEFAULT_GATEWAY_PROVIDER.id,
    model: DEFAULT_GATEWAY_PROVIDER.defaultModel
  },
  commandSafetyPrompt: true,
  theme: "system"
};
const DEFAULT_STORE = {
  sessions: [],
  messages: [],
  settings: DEFAULT_SETTINGS,
  activeSessionId: null,
  workspacePath: null
};
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function uniqueNonEmpty(values) {
  const seen = /* @__PURE__ */ new Set();
  const output = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    output.push(trimmed);
  }
  return output;
}
function cloneSettings(settings) {
  return {
    providers: settings.providers.map((provider) => ({
      ...provider,
      models: [...provider.models]
    })),
    chatSelection: { ...settings.chatSelection },
    codeSelection: { ...settings.codeSelection },
    commandSafetyPrompt: settings.commandSafetyPrompt,
    theme: settings.theme
  };
}
function normalizeThemePreference(value) {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return "system";
}
function normalizeProvider(input) {
  const kind = "openai-compatible";
  const models = uniqueNonEmpty(
    Array.isArray(input?.models) ? input.models.map((value) => String(value)) : String(input?.defaultModel ?? DEFAULT_GATEWAY_PROVIDER.defaultModel).split(",")
  );
  const fallbackModel = String(input?.defaultModel ?? DEFAULT_GATEWAY_PROVIDER.defaultModel).trim() || DEFAULT_GATEWAY_PROVIDER.defaultModel;
  if (models.length === 0) {
    models.push(fallbackModel);
  }
  const defaultModel = String(input?.defaultModel ?? models[0] ?? fallbackModel).trim() || models[0] || fallbackModel;
  if (!models.includes(defaultModel)) {
    models.unshift(defaultModel);
  }
  return {
    id: String(input?.id ?? DEFAULT_GATEWAY_PROVIDER.id).trim() || DEFAULT_GATEWAY_PROVIDER.id,
    name: String(input?.name ?? DEFAULT_GATEWAY_PROVIDER.name).trim() || DEFAULT_GATEWAY_PROVIDER.name,
    kind,
    baseUrl: DEFAULT_GATEWAY_PROVIDER.baseUrl,
    apiKey: String(input?.apiKey ?? ""),
    models,
    defaultModel
  };
}
function normalizeSelection(selection, providers, fallbackProviderId) {
  const providerId = selection?.providerId && providers.some((provider2) => provider2.id === selection.providerId) ? selection.providerId : fallbackProviderId;
  const provider = providers.find((item) => item.id === providerId) ?? providers[0];
  const model = selection?.model?.trim();
  if (!provider) {
    return {
      providerId: fallbackProviderId,
      model: ""
    };
  }
  if (model && provider.models.includes(model)) {
    return {
      providerId,
      model
    };
  }
  return {
    providerId,
    model: provider.defaultModel || provider.models[0] || ""
  };
}
function normalizeSettings(raw) {
  const legacyModel = String(raw?.openAiModel ?? DEFAULT_GATEWAY_PROVIDER.defaultModel);
  const legacyApiKey = String(raw?.openAiApiKey ?? "");
  const providersRaw = Array.isArray(raw?.providers) && raw.providers.length > 0 ? raw.providers : [{
    ...DEFAULT_GATEWAY_PROVIDER,
    apiKey: legacyApiKey,
    defaultModel: legacyModel,
    models: uniqueNonEmpty([legacyModel, ...DEFAULT_GATEWAY_PROVIDER.models])
  }];
  const selectedGatewaySource = providersRaw.find(
    (provider) => provider && typeof provider === "object" && provider.kind === "openai-compatible"
  ) ?? {
    ...DEFAULT_GATEWAY_PROVIDER,
    apiKey: legacyApiKey,
    defaultModel: legacyModel,
    models: uniqueNonEmpty([legacyModel, ...DEFAULT_GATEWAY_PROVIDER.models])
  };
  const gatewayProvider = {
    ...normalizeProvider(selectedGatewaySource),
    id: DEFAULT_GATEWAY_PROVIDER.id,
    name: DEFAULT_GATEWAY_PROVIDER.name
  };
  const providers = [gatewayProvider];
  const defaultLegacySelection = {
    providerId: gatewayProvider.id,
    model: legacyModel
  };
  const chatSelection = normalizeSelection(raw?.chatSelection ?? defaultLegacySelection, providers, gatewayProvider.id);
  const codeSelection = normalizeSelection(raw?.codeSelection ?? defaultLegacySelection, providers, gatewayProvider.id);
  return {
    providers,
    chatSelection,
    codeSelection,
    commandSafetyPrompt: raw?.commandSafetyPrompt !== false,
    theme: normalizeThemePreference(raw?.theme)
  };
}
class StudioStore {
  filePath;
  data;
  constructor(userDataPath) {
    this.filePath = join(userDataPath, STORE_FILENAME);
    this.data = this.load();
  }
  load() {
    try {
      if (!existsSync(this.filePath)) {
        return { ...DEFAULT_STORE, settings: cloneSettings(DEFAULT_SETTINGS) };
      }
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return {
        sessions: parsed.sessions ?? [],
        messages: parsed.messages ?? [],
        settings: normalizeSettings(parsed.settings ?? {}),
        activeSessionId: parsed.activeSessionId ?? null,
        workspacePath: parsed.workspacePath ?? null
      };
    } catch {
      return { ...DEFAULT_STORE, settings: cloneSettings(DEFAULT_SETTINGS) };
    }
  }
  persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }
  bootstrap() {
    return {
      sessions: [...this.data.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      settings: cloneSettings(this.data.settings),
      activeSessionId: this.data.activeSessionId,
      workspacePath: this.data.workspacePath
    };
  }
  createSession(mode) {
    const timestamp = nowIso();
    const session = {
      id: nanoid(),
      title: mode === "chat" ? "New Chat" : "New Code Session",
      mode,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.data.sessions.unshift(session);
    this.data.activeSessionId = session.id;
    this.persist();
    return session;
  }
  setActiveSession(sessionId) {
    const found = this.data.sessions.some((item) => item.id === sessionId);
    this.data.activeSessionId = found ? sessionId : this.data.activeSessionId;
    this.persist();
  }
  listMessages(sessionId) {
    return this.data.messages.filter((message) => message.sessionId === sessionId);
  }
  touchSession(sessionId) {
    const session = this.data.sessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    session.updatedAt = nowIso();
    const [extracted] = this.data.sessions.splice(this.data.sessions.indexOf(session), 1);
    if (extracted) {
      this.data.sessions.unshift(extracted);
    }
  }
  addMessage(sessionId, role, content, model, status = "done") {
    const message = {
      id: nanoid(),
      sessionId,
      role,
      content,
      createdAt: nowIso(),
      model,
      status
    };
    this.data.messages.push(message);
    this.touchSession(sessionId);
    if (role === "user" && content.trim().length > 0) {
      const title = content.trim().slice(0, 64);
      const session = this.data.sessions.find((item) => item.id === sessionId);
      if (session && (session.title === "New Chat" || session.title === "New Code Session")) {
        session.title = title;
      }
    }
    this.persist();
    return message;
  }
  appendToMessage(messageId, chunk) {
    const message = this.data.messages.find((item) => item.id === messageId);
    if (!message) {
      return null;
    }
    message.content += chunk;
    message.status = "streaming";
    this.touchSession(message.sessionId);
    this.persist();
    return message;
  }
  setMessageStatus(messageId, status) {
    const message = this.data.messages.find((item) => item.id === messageId);
    if (!message) {
      return null;
    }
    message.status = status;
    this.touchSession(message.sessionId);
    this.persist();
    return message;
  }
  updateSettings(partial) {
    const candidate = {
      ...this.data.settings,
      ...partial,
      chatSelection: {
        ...this.data.settings.chatSelection,
        ...partial.chatSelection ?? {}
      },
      codeSelection: {
        ...this.data.settings.codeSelection,
        ...partial.codeSelection ?? {}
      }
    };
    this.data.settings = normalizeSettings(candidate);
    this.persist();
    return cloneSettings(this.data.settings);
  }
  getSettings() {
    return cloneSettings(this.data.settings);
  }
  setWorkspace(path) {
    this.data.workspacePath = path;
    this.persist();
  }
}
const IGNORED_DIRS = /* @__PURE__ */ new Set([".git", "node_modules", "dist", "build", ".next", ".turbo", ".idea", ".vscode"]);
function ensureInWorkspace(workspacePath, relativePath) {
  const absoluteWorkspace = resolve(workspacePath);
  const absoluteFile = resolve(workspacePath, relativePath);
  const relativeToWorkspace = relative(absoluteWorkspace, absoluteFile);
  if (relativeToWorkspace.startsWith("..") || relativeToWorkspace.includes(`..${normalize("/")}`)) {
    throw new Error("Path escapes workspace boundary");
  }
  return absoluteFile;
}
async function pickWorkspaceFolder() {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory", "promptToCreate"],
    title: "Select a workspace folder"
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0] ?? null;
}
function listWorkspaceFiles(workspacePath, maxFiles = 3e3) {
  const root = resolve(workspacePath);
  const output = [];
  const walk = (currentDir) => {
    if (output.length >= maxFiles) {
      return;
    }
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (output.length >= maxFiles) {
        break;
      }
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      const absolutePath = join(currentDir, entry.name);
      const rel = relative(root, absolutePath).replace(/\\/g, "/");
      output.push({
        path: rel,
        name: entry.name,
        isDirectory: entry.isDirectory()
      });
      if (entry.isDirectory()) {
        walk(absolutePath);
      }
    }
  };
  walk(root);
  return output.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.path.localeCompare(b.path);
  });
}
function readWorkspaceFile(workspacePath, relativePath) {
  const absoluteFile = ensureInWorkspace(workspacePath, relativePath);
  const stats = statSync(absoluteFile);
  if (!stats.isFile()) {
    throw new Error("Target path is not a file");
  }
  return readFileSync(absoluteFile, "utf8");
}
function writeWorkspaceFile(workspacePath, relativePath, content) {
  const absoluteFile = ensureInWorkspace(workspacePath, relativePath);
  writeFileSync(absoluteFile, content, "utf8");
}
let mainWindow = null;
let store;
const commandRunner = new CommandRunner();
const appDataPath = join(app.getPath("appData"), "AI Stats Desktop Studio");
const sessionDataPath = join(appDataPath, "session-data");
mkdirSync(sessionDataPath, { recursive: true });
app.setPath("userData", appDataPath);
app.setPath("sessionData", sessionDataPath);
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disk-cache-dir", join(sessionDataPath, "cache"));
function chunkText(text, chunkSize = 48) {
  const chunks = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks.length > 0 ? chunks : [""];
}
function emit(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}
function sleep(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
function resolveProviderAndModel(settings, mode) {
  const selection = mode === "code" ? settings.codeSelection : settings.chatSelection;
  const provider = settings.providers.find((item) => item.id === selection.providerId) ?? settings.providers[0];
  if (!provider) {
    throw new Error("No providers configured. Add a provider in the sidebar settings.");
  }
  const model = provider.models.includes(selection.model) ? selection.model : provider.defaultModel || provider.models[0] || "";
  if (!model) {
    throw new Error(`Provider "${provider.name}" has no configured models.`);
  }
  return {
    provider,
    model
  };
}
async function createMainWindow() {
  const preloadMjs = join(__dirname, "../preload/index.mjs");
  const preloadPath = existsSync(preloadMjs) ? preloadMjs : join(__dirname, "../preload/index.js");
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0c1119",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  const loadRenderer = async () => {
    if (devServerUrl) {
      await mainWindow?.loadURL(devServerUrl);
      return;
    }
    await mainWindow?.loadFile(join(__dirname, "../renderer/index.html"));
  };
  mainWindow.webContents.on("did-finish-load", () => {
    console.info("[desktop-studio] renderer loaded");
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(
      `[desktop-studio] renderer failed to load (${errorCode}) ${errorDescription}: ${validatedURL}`
    );
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[desktop-studio] renderer process gone", details);
  });
  if (process.platform === "win32" || process.platform === "linux") {
    Menu.setApplicationMenu(null);
    mainWindow.removeMenu();
    mainWindow.setMenuBarVisibility(false);
  }
  await loadRenderer();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function registerIpcHandlers() {
  ipcMain.handle("studio:bootstrap", () => store.bootstrap());
  ipcMain.handle("session:create", (_event, mode) => store.createSession(mode));
  ipcMain.handle("session:set-active", (_event, sessionId) => {
    store.setActiveSession(sessionId);
  });
  ipcMain.handle("message:list", (_event, sessionId) => store.listMessages(sessionId));
  ipcMain.handle("chat:send", async (_event, input) => {
    const userMessage = store.addMessage(input.sessionId, "user", input.content);
    const { provider, model } = resolveProviderAndModel(store.getSettings(), input.mode);
    const assistantMessage = store.addMessage(input.sessionId, "assistant", "", model, "streaming");
    void (async () => {
      try {
        const conversation = store.listMessages(input.sessionId).filter((message) => message.id !== assistantMessage.id);
        const response = await generateAssistantReply(provider, model, conversation);
        for (const chunk of chunkText(response.content)) {
          store.appendToMessage(assistantMessage.id, chunk);
          emit("chat:chunk", {
            sessionId: input.sessionId,
            messageId: assistantMessage.id,
            chunk
          });
          await sleep(12);
        }
        store.setMessageStatus(assistantMessage.id, "done");
        emit("chat:done", {
          sessionId: input.sessionId,
          messageId: assistantMessage.id,
          status: "done"
        });
      } catch (error) {
        const details = error instanceof Error ? error.message : "Unknown provider error.";
        store.appendToMessage(assistantMessage.id, `
${details}`);
        store.setMessageStatus(assistantMessage.id, "error");
        emit("chat:done", {
          sessionId: input.sessionId,
          messageId: assistantMessage.id,
          status: "error",
          error: details
        });
      }
    })();
    return {
      userMessage,
      assistantMessage
    };
  });
  ipcMain.handle("settings:update", (_event, settings) => store.updateSettings(settings));
  ipcMain.handle("provider:fetch-models", async (_event, providerId) => {
    const provider = store.getSettings().providers.find((item) => item.id === providerId);
    if (!provider) {
      throw new Error("Provider not found.");
    }
    return fetchProviderModels(provider);
  });
  ipcMain.handle("workspace:pick", async () => {
    const path = await pickWorkspaceFolder();
    if (path) {
      store.setWorkspace(path);
    }
    return path;
  });
  ipcMain.handle(
    "workspace:list-files",
    (_event, workspacePath) => listWorkspaceFiles(workspacePath)
  );
  ipcMain.handle(
    "workspace:read-file",
    (_event, payload) => readWorkspaceFile(payload.workspacePath, payload.relativePath)
  );
  ipcMain.handle(
    "workspace:write-file",
    (_event, payload) => {
      writeWorkspaceFile(payload.workspacePath, payload.relativePath, payload.content);
    }
  );
  ipcMain.handle("command:run", (_event, request) => {
    return commandRunner.run(
      request,
      (chunk) => emit("command:output", chunk),
      (run) => emit("command:done", run)
    );
  });
  ipcMain.handle("command:stop", (_event, runId) => {
    commandRunner.stop(runId);
  });
  ipcMain.handle("git:status", (_event, workspacePath) => listGitStatus(workspacePath));
  ipcMain.handle(
    "git:diff",
    (_event, request) => getGitDiff(request.workspacePath, request.relativePath)
  );
  ipcMain.handle(
    "git:apply-patch",
    (_event, payload) => applyGitPatch(payload.workspacePath, payload.patch)
  );
}
app.whenReady().then(async () => {
  store = new StudioStore(app.getPath("userData"));
  registerIpcHandlers();
  await createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
