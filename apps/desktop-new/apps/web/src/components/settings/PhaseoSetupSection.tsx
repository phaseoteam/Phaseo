import { useState } from "react";
import type { EnvironmentId, ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { SettingsRow } from "./settingsLayout";
import { ProviderAuthenticationSection } from "./ProviderAuthenticationSection";

export function PhaseoSetupSection(props: {
  environmentId: EnvironmentId;
  environmentLabel: string;
  instanceId: ProviderInstanceId;
  provider: ServerProvider;
  readOnly: boolean;
}) {
  return props.provider.setup?.canInstall === false ? (
    <ProviderAuthenticationSection {...props} />
  ) : (
    <PhaseoCodexSetupSection {...props} />
  );
}

function PhaseoCodexSetupSection(props: Parameters<typeof PhaseoSetupSection>[0]) {
  const target = { environmentId: props.environmentId, input: { instanceId: props.instanceId } };
  const query = useEnvironmentQuery(serverEnvironment.providerInstallState(target));
  const start = useAtomCommand(serverEnvironment.startProviderInstall, {
    reportFailure: false,
    reportDefect: false,
  });
  const cancel = useAtomCommand(serverEnvironment.cancelProviderInstall, {
    reportFailure: false,
    reportDefect: false,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const installation = query.data;
  const active =
    installation && ["downloading", "extracting", "verifying"].includes(installation.phase);
  const installed = props.provider.installed || installation?.installedVersion != null;
  async function install() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result =
        active && installation.operationId
          ? await cancel({
              environmentId: props.environmentId,
              input: { instanceId: props.instanceId, operationId: installation.operationId },
            })
          : await start(target);
      if (result._tag === "Failure") {
        const failure = squashAtomCommandFailure(result);
        setError(
          failure instanceof Error ? failure.message : "Could not install the agent runtime.",
        );
      }
    } catch {
      setError("Could not install the agent runtime.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <ProviderAuthenticationSection {...props} />
      <SettingsRow
        title="Agent runtime"
        description="Codex runs tools and agents using your Phaseo gateway account."
        status={error ?? query.error ?? installation?.message ?? undefined}
        control={
          <div className="flex items-center gap-2">
            {installation?.phase === "downloading" &&
            installation.totalBytes &&
            installation.totalBytes > 0 ? (
              <progress
                aria-label="Agent runtime download"
                value={installation.downloadedBytes}
                max={installation.totalBytes}
              />
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={props.readOnly || pending || (!active && installed)}
              onClick={() => void install()}
            >
              {active ? "Cancel installation" : installed ? "Installed" : "Install runtime"}
            </Button>
          </div>
        }
      />
    </>
  );
}
