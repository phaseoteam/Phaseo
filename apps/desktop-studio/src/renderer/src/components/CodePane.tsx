import { lazy, memo, Suspense, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage, GitPatchApplyResult, GitStatusEntry, CommandRun, WorkspaceFile } from "@shared/types";

const MonacoEditor = lazy(async () => {
  const mod = await import("@monaco-editor/react");
  return { default: mod.default };
});

interface CodePaneProps {
  workspacePath: string | null;
  files: WorkspaceFile[];
  selectedFilePath: string | null;
  fileContent: string;
  isDirty: boolean;
  commandRuns: CommandRun[];
  commandOutputByRun: Record<string, string>;
  codeMessages: ChatMessage[];
  isSendingAssistantPrompt: boolean;
  activeProviderName: string;
  activeModel: string;
  gitStatusEntries: GitStatusEntry[];
  gitDiffContent: string;
  onPickWorkspace: () => void;
  onRefreshFiles: () => void;
  onOpenFile: (relativePath: string) => Promise<void>;
  onChangeFileContent: (value: string) => void;
  onSaveFile: () => Promise<void>;
  onRunCommand: (command: string) => Promise<void>;
  onStopCommand: (runId: string) => Promise<void>;
  onSendAssistantPrompt: (content: string) => Promise<void>;
  onRefreshGitStatus: () => Promise<void>;
  onLoadGitDiff: (relativePath?: string) => Promise<void>;
  onApplyGitPatch: (patch: string) => Promise<GitPatchApplyResult>;
}

function gitStateLabel(entry: GitStatusEntry): string {
  const code = `${entry.indexStatus}${entry.workTreeStatus}`;
  if (code === "??") {
    return "Untracked";
  }

  if (entry.indexStatus === "A" || entry.workTreeStatus === "A") {
    return "Added";
  }

  if (entry.indexStatus === "M" || entry.workTreeStatus === "M") {
    return "Modified";
  }

  if (entry.indexStatus === "D" || entry.workTreeStatus === "D") {
    return "Deleted";
  }

  if (entry.indexStatus === "R" || entry.workTreeStatus === "R") {
    return "Renamed";
  }

  return code.trim() || "Changed";
}

export const CodePane = memo(function CodePane({
  workspacePath,
  files,
  selectedFilePath,
  fileContent,
  isDirty,
  commandRuns,
  commandOutputByRun,
  codeMessages,
  isSendingAssistantPrompt,
  activeProviderName,
  activeModel,
  gitStatusEntries,
  gitDiffContent,
  onPickWorkspace,
  onRefreshFiles,
  onOpenFile,
  onChangeFileContent,
  onSaveFile,
  onRunCommand,
  onStopCommand,
  onSendAssistantPrompt,
  onRefreshGitStatus,
  onLoadGitDiff,
  onApplyGitPatch
}: CodePaneProps) {
  const [commandInput, setCommandInput] = useState("pnpm lint");
  const [assistantDraft, setAssistantDraft] = useState("");
  const [selectedGitPath, setSelectedGitPath] = useState("");
  const [patchDraft, setPatchDraft] = useState("");
  const [patchStatus, setPatchStatus] = useState("");
  const [isApplyingPatch, setIsApplyingPatch] = useState(false);

  const visibleFiles = useMemo(() => files.filter((file) => !file.isDirectory), [files]);

  if (!workspacePath) {
    return (
      <section className="code-pane empty-state">
        <h2>Code Mode</h2>
        <p>Select a local workspace to browse files, edit code, and run commands.</p>
        <button type="button" className="primary-button" onClick={onPickWorkspace}>
          Select Workspace
        </button>
      </section>
    );
  }

  return (
    <section className="code-pane">
      <div className="pane-header">
        <h2>Code Mode</h2>
        <div className="mode-chip-row">
          <span className="mode-chip">Provider: {activeProviderName}</span>
          <span className="mode-chip">Model: {activeModel}</span>
        </div>
        <div className="pane-header-actions">
          <button type="button" className="secondary-button" onClick={onPickWorkspace}>
            Switch Workspace
          </button>
          <button type="button" className="secondary-button" onClick={onRefreshFiles}>
            Refresh Files
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!selectedFilePath || !isDirty}
            onClick={() => void onSaveFile()}
          >
            Save File
          </button>
        </div>
      </div>

      <div className="code-grid">
        <aside className="file-list" aria-label="Workspace files">
          <div className="section-label">Files ({visibleFiles.length})</div>
          <ul>
            {visibleFiles.map((file) => (
              <li key={file.path}>
                <button
                  type="button"
                  className={file.path === selectedFilePath ? "file-item active" : "file-item"}
                  onClick={() => void onOpenFile(file.path)}
                >
                  {file.path}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="editor-pane">
          {selectedFilePath ? (
            <>
              <div className="editor-header">
                <span>{selectedFilePath}</span>
                <span>{isDirty ? "Unsaved changes" : "Saved"}</span>
              </div>
              <Suspense fallback={<div className="editor-fallback">Loading editor...</div>}>
                <MonacoEditor
                  path={selectedFilePath}
                  value={fileContent}
                  onChange={(value: string | undefined) => onChangeFileContent(value ?? "")}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    automaticLayout: true,
                    wordWrap: "on"
                  }}
                />
              </Suspense>
            </>
          ) : (
            <div className="editor-fallback">Select a file to start editing.</div>
          )}
        </div>

        <aside className="terminal-pane">
          <div className="section-label">Command Runner</div>
          <div className="command-input-row">
            <input
              value={commandInput}
              onChange={(event) => setCommandInput(event.target.value)}
              placeholder="pnpm test"
            />
            <button type="button" className="primary-button" onClick={() => void onRunCommand(commandInput)}>
              Run
            </button>
          </div>

          <ul className="command-run-list">
            {commandRuns.map((run) => (
              <li key={run.id} className="command-run-item">
                <header>
                  <strong>{run.command}</strong>
                  <span>{run.finishedAt ? `Exit ${run.exitCode ?? 0}` : "Running"}</span>
                </header>
                <pre>{commandOutputByRun[run.id] ?? ""}</pre>
                {!run.finishedAt ? (
                  <button type="button" className="secondary-button" onClick={() => void onStopCommand(run.id)}>
                    Stop
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="git-panel">
            <div className="section-label">Git Status + Diff</div>
            <div className="provider-actions-row">
              <button type="button" className="secondary-button" onClick={() => void onRefreshGitStatus()}>
                Refresh Status
              </button>
              <button type="button" className="secondary-button" onClick={() => void onLoadGitDiff()}>
                Load Full Diff
              </button>
            </div>

            <div className="git-file-picker-row">
              <select value={selectedGitPath} onChange={(event) => setSelectedGitPath(event.target.value)}>
                <option value="">All changed files</option>
                {gitStatusEntries.map((entry) => (
                  <option key={entry.path} value={entry.path}>
                    {entry.path}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void onLoadGitDiff(selectedGitPath || undefined)}
              >
                Load File Diff
              </button>
            </div>

            <ul className="git-status-list">
              {gitStatusEntries.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    className="git-status-item"
                    onClick={() => {
                      setSelectedGitPath(entry.path);
                      void onLoadGitDiff(entry.path);
                    }}
                  >
                    <span>{entry.path}</span>
                    <span>{gitStateLabel(entry)}</span>
                  </button>
                </li>
              ))}
            </ul>

            <pre className="git-diff-view">{gitDiffContent || "No diff loaded."}</pre>

            <textarea
              className="patch-editor"
              value={patchDraft}
              onChange={(event) => setPatchDraft(event.target.value)}
              placeholder="Paste a unified diff patch here, then apply it..."
            />
            <div className="provider-actions-row">
              <button
                type="button"
                className="primary-button"
                disabled={isApplyingPatch || patchDraft.trim().length === 0}
                onClick={async () => {
                  setIsApplyingPatch(true);
                  const result = await onApplyGitPatch(patchDraft);
                  setPatchStatus(result.output);
                  if (result.applied) {
                    setPatchDraft("");
                    await onRefreshGitStatus();
                    await onLoadGitDiff(selectedGitPath || undefined);
                  }
                  setIsApplyingPatch(false);
                }}
              >
                {isApplyingPatch ? "Applying..." : "Apply Patch"}
              </button>
              {patchStatus ? <span className="patch-status-text">{patchStatus}</span> : null}
            </div>
          </div>

          <div className="assistant-panel">
            <div className="section-label">Code Assistant</div>
            <div className="assistant-message-list">
              {codeMessages.map((message) => (
                <article key={message.id} className={`assistant-message message-${message.role}`}>
                  <header>
                    <strong>{message.role === "assistant" ? "Assistant" : "You"}</strong>
                    <span>{message.status ?? "done"}</span>
                  </header>
                  {message.role === "assistant" ? (
                    <div className="markdown">
                      <ReactMarkdown>{message.content || "..."}</ReactMarkdown>
                    </div>
                  ) : (
                    <p>{message.content}</p>
                  )}
                </article>
              ))}
            </div>
            <div className="assistant-composer">
              <textarea
                value={assistantDraft}
                onChange={(event) => setAssistantDraft(event.target.value)}
                placeholder="Ask for a refactor, tests, or a patch for the selected file..."
              />
              <button
                type="button"
                className="primary-button"
                disabled={assistantDraft.trim().length === 0 || isSendingAssistantPrompt}
                onClick={async () => {
                  const content = assistantDraft.trim();
                  if (!content) {
                    return;
                  }
                  setAssistantDraft("");
                  await onSendAssistantPrompt(content);
                }}
              >
                {isSendingAssistantPrompt ? "Thinking..." : "Send"}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
});
