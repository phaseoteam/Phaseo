import { lazy, memo, Suspense, useMemo, useState } from "react";
import type { CommandRun, WorkspaceFile } from "@shared/types";

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
  onPickWorkspace: () => void;
  onRefreshFiles: () => void;
  onOpenFile: (relativePath: string) => Promise<void>;
  onChangeFileContent: (value: string) => void;
  onSaveFile: () => Promise<void>;
  onRunCommand: (command: string) => Promise<void>;
  onStopCommand: (runId: string) => Promise<void>;
}

export const CodePane = memo(function CodePane({
  workspacePath,
  files,
  selectedFilePath,
  fileContent,
  isDirty,
  commandRuns,
  commandOutputByRun,
  onPickWorkspace,
  onRefreshFiles,
  onOpenFile,
  onChangeFileContent,
  onSaveFile,
  onRunCommand,
  onStopCommand
}: CodePaneProps) {
  const [commandInput, setCommandInput] = useState("pnpm lint");

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
                  onChange={(value) => onChangeFileContent(value ?? "")}
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
                  <span>
                    {run.finishedAt ? `Exit ${run.exitCode ?? 0}` : "Running"}
                  </span>
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
        </aside>
      </div>
    </section>
  );
});
